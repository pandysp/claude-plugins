#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "pathname"
require "rbconfig"
require "yaml"
require_relative "generate_codex"

ROOT = Pathname.new(__dir__).parent
failures = []

generator = ROOT.join("scripts/generate_codex.rb")
unless system(RbConfig.ruby, generator.to_s, "--check")
  failures << "Codex generated files are stale; run ruby scripts/generate_codex.rb"
end

plugin_dirs = Dir.glob(ROOT.join("plugins/*")).select { |p| File.directory?(p) }
                 .map { |p| Pathname.new(p) }.sort

failures << "No plugin directories found under plugins/" if plugin_dirs.empty?

# --- skill and agent frontmatter ----------------------------------------------

validate_frontmatter = lambda do |path, expected_name|
  relative_path = path.relative_path_from(ROOT)
  match = path.read.match(/\A---\n(.*?)\n---(?:\n|\z)/m)

  unless match
    failures << "#{relative_path}: missing YAML frontmatter"
    next
  end

  begin
    frontmatter = YAML.safe_load(match[1], permitted_classes: [], aliases: false)
  rescue Psych::SyntaxError => error
    failures << "#{relative_path}: invalid YAML: #{error.message}"
    next
  end

  unless frontmatter.is_a?(Hash)
    failures << "#{relative_path}: frontmatter must be a YAML mapping"
    next
  end

  name = frontmatter["name"]
  description = frontmatter["description"]

  failures << "#{relative_path}: frontmatter.name must be a non-empty string" unless name.is_a?(String) && !name.empty?
  failures << "#{relative_path}: frontmatter.description must be a non-empty string" unless description.is_a?(String) && !description.empty?
  failures << "#{relative_path}: frontmatter.name '#{name}' must match '#{expected_name}'" if name.is_a?(String) && !name.empty? && name != expected_name
  failures << "#{relative_path}: description exceeds 1024 characters (#{description.length})" if description.is_a?(String) && description.length > 1024
end

skill_paths = Dir.glob(ROOT.join("plugins/*/skills/*/SKILL.md")).sort.map { |path| Pathname.new(path) }
skill_paths.each { |path| validate_frontmatter.call(path, path.dirname.basename.to_s) }

skill_names = skill_paths.map { |path| path.dirname.basename.to_s }
slash_invocation = %r{(?<![A-Za-z0-9_.-])/(?:#{skill_names.map { |name| Regexp.escape(name) }.join("|")})(?=\b|:)}
skill_paths.each do |path|
  plugin_name = path.relative_path_from(ROOT).each_filename.to_a.fetch(1)
  next if CodexGenerator::UNAVAILABLE_PLUGINS.include?(plugin_name)

  match = path.read.match(slash_invocation)
  if match
    failures << "#{path.relative_path_from(ROOT)}: host-specific skill invocation '#{match[0]}'"
  end
end

agent_paths = Dir.glob(ROOT.join("plugins/*/agents/*.md")).sort.map { |path| Pathname.new(path) }
agent_paths.each { |path| validate_frontmatter.call(path, path.basename(".md").to_s) }

hunter_reference = ROOT.join("plugins/silent-failures/skills/silent-failures/references/hunter-methodology.md")
failures << "silent-failures: missing canonical hunter methodology" unless hunter_reference.exist?
if agent_paths.any? { |path| path.basename.to_s == "silent-failure-hunter.md" }
  agent_body = ROOT.join("plugins/silent-failures/agents/silent-failure-hunter.md").read
  unless agent_body.include?("skills/silent-failures/references/hunter-methodology.md")
    failures << "silent-failures: Claude agent must load the canonical hunter methodology"
  end
end

# --- plugin manifests, hooks, scripts ------------------------------------------

claude_manifests = {}
plugin_dirs.each do |dir|
  name = dir.basename.to_s
  claude_manifest_path = dir.join(".claude-plugin/plugin.json")
  codex_manifest_path = dir.join(".codex-plugin/plugin.json")

  unless claude_manifest_path.exist?
    failures << "plugins/#{name}: missing .claude-plugin/plugin.json"
    next
  end

  begin
    claude_manifest = JSON.parse(claude_manifest_path.read)
  rescue JSON::ParserError => error
    failures << "plugins/#{name}: invalid Claude plugin.json: #{error.message}"
    next
  end

  claude_manifests[name] = claude_manifest
  failures << "plugins/#{name}: Claude plugin.json name '#{claude_manifest["name"]}' must match the directory" unless claude_manifest["name"] == name
  %w[description version author homepage license].each do |field|
    failures << "plugins/#{name}: Claude plugin.json missing #{field}" unless claude_manifest.key?(field)
  end

  unless codex_manifest_path.exist?
    failures << "plugins/#{name}: missing .codex-plugin/plugin.json"
    next
  end

  begin
    codex_manifest = JSON.parse(codex_manifest_path.read)
  rescue JSON::ParserError => error
    failures << "plugins/#{name}: invalid Codex plugin.json: #{error.message}"
    next
  end

  %w[name version description author homepage license].each do |field|
    unless codex_manifest[field] == claude_manifest[field]
      failures << "plugins/#{name}: Codex #{field} differs from Claude plugin.json"
    end
  end
  unless codex_manifest["repository"] == "https://github.com/pandysp/claude-plugins"
    failures << "plugins/#{name}: Codex repository is incorrect"
  end

  interface = codex_manifest["interface"]
  unless interface.is_a?(Hash)
    failures << "plugins/#{name}: Codex plugin.json missing interface"
  else
    %w[displayName shortDescription longDescription developerName category capabilities defaultPrompt].each do |field|
      failures << "plugins/#{name}: Codex interface missing #{field}" unless interface.key?(field)
    end
  end

  has_skills = !Dir.glob(dir.join("skills/*/SKILL.md")).empty?
  if has_skills
    unless codex_manifest["skills"] == "./skills/"
      failures << "plugins/#{name}: Codex skills must be ./skills/"
    end
  elsif codex_manifest.key?("skills")
    failures << "plugins/#{name}: Codex skills declared without a skills directory"
  end
  failures << "plugins/#{name}: README.md missing" unless dir.join("README.md").exist?

  hooks_path = dir.join("hooks/hooks.json")
  if hooks_path.exist?
    begin
      hooks = JSON.parse(hooks_path.read)
      failures << "plugins/#{name}: hooks.json must have a top-level \"hooks\" object" unless hooks["hooks"].is_a?(Hash)
    rescue JSON::ParserError => error
      failures << "plugins/#{name}: invalid hooks.json: #{error.message}"
    end
  end

  Dir.glob(dir.join("bin/*")).each do |script|
    relative_script = Pathname.new(script).relative_path_from(ROOT)
    failures << "#{relative_script}: not executable" unless File.executable?(script)
  end
end

# --- marketplace ----------------------------------------------------------------

begin
  marketplace = JSON.parse(ROOT.join(".claude-plugin/marketplace.json").read)
  entries = marketplace.fetch("plugins", []).to_h { |entry| [entry["name"], entry] }
  dir_names = plugin_dirs.map { |dir| dir.basename.to_s }

  (dir_names - entries.keys).each { |name| failures << "marketplace.json: missing entry for plugins/#{name}" }
  (entries.keys - dir_names).each { |name| failures << "marketplace.json: entry '#{name}' has no plugin directory" }

  entries.each do |name, entry|
    next unless claude_manifests.key?(name)
    failures << "marketplace.json: #{name}.source must be ./plugins/#{name}" unless entry["source"] == "./plugins/#{name}"
    unless entry["description"] == claude_manifests[name]["description"]
      failures << "marketplace.json: #{name} description differs from plugin.json (plugin.json is canonical)"
    end
  end
rescue JSON::ParserError => error
  failures << ".claude-plugin/marketplace.json: invalid JSON: #{error.message}"
end

begin
  marketplace = JSON.parse(ROOT.join(".agents/plugins/marketplace.json").read)
  entries = marketplace.fetch("plugins", []).to_h { |entry| [entry["name"], entry] }
  dir_names = plugin_dirs.map { |dir| dir.basename.to_s }

  (dir_names - entries.keys).each { |name| failures << "Codex marketplace: missing entry for plugins/#{name}" }
  (entries.keys - dir_names).each { |name| failures << "Codex marketplace: entry '#{name}' has no plugin directory" }

  entries.each do |name, entry|
    expected_path = "./plugins/#{name}"
    source = entry["source"]
    unless source == { "source" => "local", "path" => expected_path }
      failures << "Codex marketplace: #{name}.source must point to #{expected_path}"
    end
    policy = entry["policy"]
    expected_policy = {
      "installation" => CodexGenerator.installation_policy(name),
      "authentication" => "ON_INSTALL"
    }
    unless policy == expected_policy
      failures << "Codex marketplace: #{name}.policy must be #{expected_policy}"
    end
    unless entry["category"].is_a?(String) && !entry["category"].empty?
      failures << "Codex marketplace: #{name} missing category"
    end
  end
rescue Errno::ENOENT
  failures << ".agents/plugins/marketplace.json: missing"
rescue JSON::ParserError => error
  failures << ".agents/plugins/marketplace.json: invalid JSON: #{error.message}"
end

# --- root README index ----------------------------------------------------------

readme = ROOT.join("README.md").read
plugin_dirs.each do |dir|
  name = dir.basename.to_s
  failures << "README.md: missing table row for #{name}" unless readme.include?("[#{name}](./plugins/#{name})")
end

if failures.empty?
  puts "Validated #{skill_paths.length} skills, #{agent_paths.length} agents, and #{plugin_dirs.length} dual-host plugins: frontmatter, manifests, hooks, marketplaces, generated-file sync, README index."
else
  warn "Validation failed:"
  failures.each { |failure| warn "  - #{failure}" }
  exit 1
end

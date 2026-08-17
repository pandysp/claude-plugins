#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "pathname"
require "rbconfig"
require "yaml"
require_relative "generate"

ROOT = Pathname.new(__dir__).parent
failures = []

unless system(RbConfig.ruby, ROOT.join("scripts/generate.rb").to_s, "--check")
  failures << "Generated Codex and Pi files are stale; run ruby scripts/generate.rb"
end

plugin_dirs = Dir.glob(ROOT.join("plugins/*")).select { |p| File.directory?(p) }
                 .map { |p| Pathname.new(p) }.sort

failures << "No plugin directories found under plugins/" if plugin_dirs.empty?

# --- skill and agent frontmatter ----------------------------------------------

skill_frontmatter = {}

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

  skill_frontmatter[path.to_s] = name if name.is_a?(String) && !name.empty?
end

skill_paths = Dir.glob(ROOT.join("plugins/*/skills/*/SKILL.md")).sort.map { |path| Pathname.new(path) }
skill_paths.each { |path| validate_frontmatter.call(path, path.dirname.basename.to_s) }

slash_invocation = %r{(?<![A-Za-z0-9_.-])/(?:#{skill_paths.map { |path| Regexp.escape(path.dirname.basename.to_s) }.join("|")})(?=\b|:)}
skill_paths.each do |path|
  plugin_name = path.relative_path_from(ROOT).each_filename.to_a.fetch(1)
  next unless HostPackages.supported?(plugin_name, :codex) || HostPackages.supported?(plugin_name, :pi)

  match = path.read.match(slash_invocation)
  if match
    failures << "#{path.relative_path_from(ROOT)}: host-specific skill invocation '#{match[0]}'"
  end
end

agent_paths = Dir.glob(ROOT.join("plugins/*/agents/*.md")).sort.map { |path| Pathname.new(path) }
agent_paths.each { |path| validate_frontmatter.call(path, path.basename(".md").to_s) }

silent_failures_skill = ROOT.join("plugins/silent-failures/skills/silent-failures/SKILL.md").read
unless silent_failures_skill.include?("## Hunter methodology") &&
       silent_failures_skill.include?("### Principles") &&
       silent_failures_skill.include?("### Process")
  failures << "silent-failures: shared skill must contain the canonical hunter methodology"
end
if agent_paths.any? { |path| path.basename.to_s == "silent-failure-hunter.md" }
  agent_body = ROOT.join("plugins/silent-failures/agents/silent-failure-hunter.md").read
  unless agent_body.include?("skills/silent-failures/SKILL.md") && agent_body.include?("Hunter methodology")
    failures << "silent-failures: Claude agent must load the canonical hunter methodology"
  end
end

# --- plugin manifests, hooks, scripts ------------------------------------------

claude_manifests = {}
plugin_dirs.each do |dir|
  name = dir.basename.to_s
  claude_manifest_path = dir.join(".claude-plugin/plugin.json")

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

# --- pi skill names -------------------------------------------------------------

# generate.rb writes package.json from disk, so paths and membership are covered
# by --check. Uniqueness is not: two plugins could ship skills whose frontmatter
# names collide, and Pi would keep the first and only warn.
skill_names = {}
HostPackages::HOST_SUPPORT.each_key do |plugin|
  next unless HostPackages.supported?(plugin, :pi)

  HostPackages.skill_dirs(plugin).each do |dir|
    name = skill_frontmatter[ROOT.join(dir, "SKILL.md").to_s]
    next if name.nil?

    if skill_names.key?(name)
      failures << "Pi would drop a skill: '#{name}' is declared by #{skill_names[name]} and #{dir}"
    else
      skill_names[name] = dir
    end
  end
end

# --- host support declaration ---------------------------------------------------

# Fail closed: a plugin that does not state its Codex and Pi support cannot ship.
declared = HostPackages::HOST_SUPPORT
dir_names = plugin_dirs.map { |dir| dir.basename.to_s }

(dir_names - declared.keys).each do |name|
  failures << "host-support.yaml: plugins/#{name} is missing; state codex and pi support"
end
(declared.keys - dir_names).each do |name|
  failures << "host-support.yaml: declares '#{name}', which has no plugin directory"
end

declared.each do |name, hosts|
  %i[codex pi].each do |host|
    value = hosts[host]
    case value
    when true then next
    when String then failures << "host-support.yaml: #{name}.#{host} reason must not be empty" if value.strip.empty?
    when nil then failures << "host-support.yaml: #{name} does not state #{host} support"
    else failures << "host-support.yaml: #{name}.#{host} must be true or a reason string"
    end
  end
end

# The README points at host-support.yaml rather than restating it, so the link is
# the only thing left to keep honest.
failures << "README.md: does not link host-support.yaml" unless ROOT.join("README.md").read.include?("host-support.yaml")

# --- root README index ----------------------------------------------------------

readme = ROOT.join("README.md").read
plugin_dirs.each do |dir|
  name = dir.basename.to_s
  failures << "README.md: missing table row for #{name}" unless readme.include?("[#{name}](./plugins/#{name})")
end

if failures.empty?
  puts "Validated #{plugin_dirs.length} plugins (#{skill_paths.length} skills, #{agent_paths.length} agents): declared host support, generated Codex and Pi packages, manifests, hooks, marketplaces, README."
else
  warn "Validation failed:"
  failures.each { |failure| warn "  - #{failure}" }
  exit 1
end

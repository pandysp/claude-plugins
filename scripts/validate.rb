#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "pathname"
require "yaml"

ROOT = Pathname.new(__dir__).parent
failures = []

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

agent_paths = Dir.glob(ROOT.join("plugins/*/agents/*.md")).sort.map { |path| Pathname.new(path) }
agent_paths.each { |path| validate_frontmatter.call(path, path.basename(".md").to_s) }

# --- plugin manifests, hooks, scripts ------------------------------------------

manifests = {}
plugin_dirs.each do |dir|
  name = dir.basename.to_s
  manifest_path = dir.join(".claude-plugin/plugin.json")

  unless manifest_path.exist?
    failures << "plugins/#{name}: missing .claude-plugin/plugin.json"
    next
  end

  begin
    manifest = JSON.parse(manifest_path.read)
  rescue JSON::ParserError => error
    failures << "plugins/#{name}: invalid plugin.json: #{error.message}"
    next
  end

  manifests[name] = manifest
  failures << "plugins/#{name}: plugin.json name '#{manifest["name"]}' must match the directory" unless manifest["name"] == name
  %w[description version author homepage license].each do |field|
    failures << "plugins/#{name}: plugin.json missing #{field}" unless manifest.key?(field)
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
    next unless manifests.key?(name)
    failures << "marketplace.json: #{name}.source must be ./plugins/#{name}" unless entry["source"] == "./plugins/#{name}"
    unless entry["description"] == manifests[name]["description"]
      failures << "marketplace.json: #{name} description differs from plugin.json (plugin.json is canonical)"
    end
  end
rescue JSON::ParserError => error
  failures << ".claude-plugin/marketplace.json: invalid JSON: #{error.message}"
end

# --- root README index ----------------------------------------------------------

readme = ROOT.join("README.md").read
plugin_dirs.each do |dir|
  name = dir.basename.to_s
  failures << "README.md: missing table row for #{name}" unless readme.include?("[#{name}](./plugins/#{name})")
end

if failures.empty?
  puts "Validated #{skill_paths.length} skills, #{agent_paths.length} agents, and #{plugin_dirs.length} plugins: frontmatter, manifests, hooks, marketplace sync, README index."
else
  warn "Validation failed:"
  failures.each { |failure| warn "  - #{failure}" }
  exit 1
end

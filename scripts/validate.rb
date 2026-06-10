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

# --- skill frontmatter -------------------------------------------------------

skill_paths = Dir.glob(ROOT.join("plugins/*/skills/*/SKILL.md")).sort.map { |path| Pathname.new(path) }

skill_paths.each do |path|
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
  failures << "#{relative_path}: frontmatter.name '#{name}' must match the skill directory '#{path.dirname.basename}'" if name.is_a?(String) && name != path.dirname.basename.to_s
  failures << "#{relative_path}: description exceeds 1024 characters (#{description.length})" if description.is_a?(String) && description.length > 1024
end

# --- plugin manifests --------------------------------------------------------

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
end

# --- marketplace -------------------------------------------------------------

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

# --- root README index -------------------------------------------------------

readme = ROOT.join("README.md").read
plugin_dirs.each do |dir|
  name = dir.basename.to_s
  failures << "README.md: missing table row for #{name}" unless readme.include?("[#{name}](./plugins/#{name})")
end

if failures.empty?
  puts "Validated #{skill_paths.length} skills and #{plugin_dirs.length} plugins: frontmatter, manifests, marketplace sync, README index."
else
  warn "Validation failed:"
  failures.each { |failure| warn "  - #{failure}" }
  exit 1
end

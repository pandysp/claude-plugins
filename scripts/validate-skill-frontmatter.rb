#!/usr/bin/env ruby
# frozen_string_literal: true

require "pathname"
require "yaml"

ROOT = Pathname.new(__dir__).parent
skill_paths = Dir.glob(ROOT.join("plugins/*/skills/*/SKILL.md")).sort.map { |path| Pathname.new(path) }

failures = []

if skill_paths.empty?
  failures << "No skill files found under plugins/*/skills/*/SKILL.md"
end

skill_paths.each do |path|
  relative_path = path.relative_path_from(ROOT)
  content = path.read
  match = content.match(/\A---\n(.*?)\n---(?:\n|\z)/m)

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
end

if failures.empty?
  puts "Validated #{skill_paths.length} skill frontmatter blocks."
else
  warn "Skill frontmatter validation failed:"
  failures.each { |failure| warn "  - #{failure}" }
  exit 1
end

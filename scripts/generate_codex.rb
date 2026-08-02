#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"
require "json"
require "pathname"

module CodexGenerator
  ROOT = Pathname.new(__dir__).parent
  CLAUDE_MARKETPLACE = ROOT.join(".claude-plugin/marketplace.json")
  CODEX_MARKETPLACE = ROOT.join(".agents/plugins/marketplace.json")

  CATEGORY_NAMES = {
    "workflow" => "Productivity",
    "tooling" => "Developer Tools"
  }.freeze

  module_function

  def titleize(name)
    name.split("-").map(&:capitalize).join(" ")
  end

  def pretty_json(payload)
    "#{JSON.pretty_generate(payload)}\n"
  end

  def short_description(description)
    first_sentence = description.split(/(?<=[.!?])\s/, 2).first
    return first_sentence if first_sentence.length <= 120

    "#{first_sentence[0, 117].rstrip}..."
  end

  def source_marketplace
    JSON.parse(CLAUDE_MARKETPLACE.read)
  end

  def codex_manifest(entry)
    plugin_root = ROOT.join(entry.fetch("source"))
    claude_manifest = JSON.parse(plugin_root.join(".claude-plugin/plugin.json").read)
    display_name = titleize(claude_manifest.fetch("name"))
    has_skills = !Dir.glob(plugin_root.join("skills/*/SKILL.md")).empty?

    manifest = {
      "name" => claude_manifest.fetch("name"),
      "version" => claude_manifest.fetch("version"),
      "description" => claude_manifest.fetch("description"),
      "author" => claude_manifest.fetch("author"),
      "homepage" => claude_manifest.fetch("homepage"),
      "repository" => "https://github.com/pandysp/claude-plugins",
      "license" => claude_manifest.fetch("license"),
      "keywords" => entry.fetch("keywords", []),
      "interface" => {
        "displayName" => display_name,
        "shortDescription" => short_description(entry.fetch("description")),
        "longDescription" => claude_manifest.fetch("description"),
        "developerName" => claude_manifest.dig("author", "name"),
        "category" => CATEGORY_NAMES.fetch(entry.fetch("category")),
        "capabilities" => [],
        "defaultPrompt" => has_skills ?
          "Apply the #{display_name} workflow to this task." :
          "Help me configure #{display_name}."
      }
    }
    manifest["skills"] = "./skills/" if has_skills
    manifest
  end

  def codex_marketplace(source)
    {
      "name" => source.fetch("name"),
      "interface" => {
        "displayName" => "pandysp"
      },
      "plugins" => source.fetch("plugins").map do |entry|
        {
          "name" => entry.fetch("name"),
          "source" => {
            "source" => "local",
            "path" => entry.fetch("source")
          },
          "policy" => {
            "installation" => "AVAILABLE",
            "authentication" => "ON_INSTALL"
          },
          "category" => CATEGORY_NAMES.fetch(entry.fetch("category"))
        }
      end
    }
  end

  def expected_files
    source = source_marketplace
    files = {
      CODEX_MARKETPLACE => pretty_json(codex_marketplace(source))
    }

    source.fetch("plugins").each do |entry|
      plugin_root = ROOT.join(entry.fetch("source"))
      path = plugin_root.join(".codex-plugin/plugin.json")
      files[path] = pretty_json(codex_manifest(entry))
    end
    files
  end

  def stale_paths
    expected_files.each_with_object([]) do |(path, expected), stale|
      stale << path unless path.file? && path.read == expected
    end
  end

  def write!
    expected_files.each do |path, contents|
      FileUtils.mkdir_p(path.dirname)
      path.write(contents)
    end
  end
end

if $PROGRAM_NAME == __FILE__
  if ARGV == ["--check"]
    stale = CodexGenerator.stale_paths
    if stale.empty?
      puts "Codex manifests and marketplace are current."
    else
      warn "Generated Codex files are missing or stale:"
      stale.each { |path| warn "  - #{path.relative_path_from(CodexGenerator::ROOT)}" }
      warn "Run: ruby scripts/generate_codex.rb"
      exit 1
    end
  elsif ARGV.empty?
    CodexGenerator.write!
    puts "Generated #{CodexGenerator.expected_files.length} Codex files."
  else
    warn "Usage: ruby scripts/generate_codex.rb [--check]"
    exit 1
  end
end

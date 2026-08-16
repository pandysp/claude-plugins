#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"
require "json"
require "pathname"

# Generates the Codex and Pi host packages from the Claude metadata, which stays
# canonical. Run after changing plugins, then run scripts/validate.rb.
#
#   ruby scripts/generate.rb           # write
#   ruby scripts/generate.rb --check   # fail if anything on disk is stale
#
# HOST_SUPPORT below is the only place host support is decided. Every plugin
# directory must appear in it: `true` ships the plugin to that host, a string
# withholds it and states why. validate.rb fails on a plugin that is missing
# here, so a new plugin cannot reach Codex or Pi by accident, and cannot be
# withheld without a reason.
module HostPackages
  ROOT = Pathname.new(__dir__).parent
  CLAUDE_MARKETPLACE = ROOT.join(".claude-plugin/marketplace.json")
  CODEX_MARKETPLACE = ROOT.join(".agents/plugins/marketplace.json")
  PI_PACKAGE = ROOT.join("package.json")
  PI_LOCKFILE = ROOT.join("package-lock.json")

  HOST_SUPPORT = {
    "align" => { codex: true, pi: true },
    "clarify" => { codex: true, pi: true },
    "design-options" => { codex: true, pi: true },
    "drive-browser" => {
      codex: true,
      pi: "the vision loop needs a browser runtime and screenshots returned to the model; unverified on Pi"
    },
    "explore" => { codex: true, pi: true },
    "handoff" => { codex: true, pi: true },
    "pre-mortem" => { codex: true, pi: true },
    "preflight" => { codex: true, pi: true },
    "quality-review" => {
      codex: "high, xhigh, and max reviews need Claude's Workflow tool",
      pi: "high, xhigh, and max reviews need Claude's Workflow tool"
    },
    "reflect" => { codex: true, pi: true },
    "second-opinion" => { codex: true, pi: true },
    "silent-failures" => { codex: true, pi: true },
    "spec" => { codex: true, pi: true },
    "steel-man-own-position" => { codex: true, pi: true },
    "understudy" => { codex: true, pi: true },
    "verify-claims" => { codex: true, pi: true },
    "verify-result" => { codex: true, pi: true },
    "worktrunk-hook" => {
      codex: "the plugin is hooks only and needs Claude Code's WorktreeCreate and WorktreeRemove events",
      pi: "the plugin is hooks only and needs Claude Code's WorktreeCreate and WorktreeRemove events"
    }
  }.freeze

  CATEGORY_NAMES = { "workflow" => "Productivity", "tooling" => "Developer Tools" }.freeze

  PI_PACKAGE_NAME = "pandysp-plugins"
  # Metadata for humans: Pi identifies a git package by repository URL, not version.
  PI_PACKAGE_VERSION = "1.0.0"

  module_function

  def supported?(plugin, host)
    HOST_SUPPORT.dig(plugin, host) == true
  end

  def pretty_json(payload)
    "#{JSON.pretty_generate(payload)}\n"
  end

  def marketplace_entries
    JSON.parse(CLAUDE_MARKETPLACE.read).fetch("plugins")
  end

  def skill_dirs(plugin)
    Dir.glob(ROOT.join("plugins", plugin, "skills/*/SKILL.md")).sort.map do |skill|
      Pathname.new(skill).dirname.relative_path_from(ROOT).to_s
    end
  end

  def titleize(name)
    name.split("-").map(&:capitalize).join(" ")
  end

  # The documented manifest is name, version, description, and skills:
  # https://developers.openai.com/plugins/build/plugins. Codex accepts more, but
  # nothing else appears in its docs, so nothing else is written.
  def codex_manifest(plugin)
    claude = JSON.parse(ROOT.join("plugins", plugin, ".claude-plugin/plugin.json").read)
    manifest = {
      "name" => claude.fetch("name"),
      "version" => claude.fetch("version"),
      "description" => claude.fetch("description")
    }
    manifest["skills"] = "./skills/" unless skill_dirs(plugin).empty?
    manifest
  end

  def codex_marketplace
    {
      "name" => "pandysp",
      "interface" => { "displayName" => "pandysp" },
      "plugins" => marketplace_entries.map do |entry|
        plugin = entry.fetch("name")
        {
          "name" => plugin,
          "interface" => { "displayName" => titleize(plugin) },
          "source" => { "source" => "local", "path" => entry.fetch("source") },
          "policy" => {
            "installation" => supported?(plugin, :codex) ? "AVAILABLE" : "NOT_AVAILABLE",
            "authentication" => "ON_INSTALL"
          },
          "category" => CATEGORY_NAMES.fetch(entry.fetch("category"))
        }
      end
    }
  end

  # Pi installs one package per repository. Paths are expanded here, so the
  # manifest carries no globs and a new plugin cannot appear without this diff.
  def pi_package
    skills = marketplace_entries.flat_map do |entry|
      plugin = entry.fetch("name")
      supported?(plugin, :pi) ? skill_dirs(plugin) : []
    end

    {
      "name" => PI_PACKAGE_NAME,
      "version" => PI_PACKAGE_VERSION,
      "private" => true,
      "description" => "Workflow skills by pandysp, packaged for Pi.",
      "homepage" => "https://github.com/pandysp/claude-plugins",
      "repository" => { "type" => "git", "url" => "git+https://github.com/pandysp/claude-plugins.git" },
      "author" => { "name" => "Andreas Spannagel" },
      "license" => "MIT",
      "pi" => { "skills" => skills }
    }
  end

  # Pi runs `npm install --omit=dev` after every clone and ref change. Without a
  # committed lockfile npm writes one and the checkout goes dirty. No
  # dependencies means the lockfile is derivable; CI proves it matches npm's.
  def pi_lockfile
    {
      "name" => PI_PACKAGE_NAME,
      "version" => PI_PACKAGE_VERSION,
      "lockfileVersion" => 3,
      "requires" => true,
      "packages" => { "" => { "name" => PI_PACKAGE_NAME, "version" => PI_PACKAGE_VERSION, "license" => "MIT" } }
    }
  end

  def expected_files
    files = {
      CODEX_MARKETPLACE => pretty_json(codex_marketplace),
      PI_PACKAGE => pretty_json(pi_package),
      PI_LOCKFILE => pretty_json(pi_lockfile)
    }
    marketplace_entries.each do |entry|
      plugin = entry.fetch("name")
      files[ROOT.join(entry.fetch("source"), ".codex-plugin/plugin.json")] = pretty_json(codex_manifest(plugin))
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
    stale = HostPackages.stale_paths
    if stale.empty?
      puts "Codex and Pi packages are current."
    else
      warn "Generated files are missing or stale:"
      stale.each { |path| warn "  - #{path.relative_path_from(HostPackages::ROOT)}" }
      warn "Run: ruby scripts/generate.rb"
      exit 1
    end
  elsif ARGV.empty?
    HostPackages.write!
    puts "Generated #{HostPackages.expected_files.length} files for Codex and Pi."
  else
    warn "Usage: ruby scripts/generate.rb [--check]"
    exit 1
  end
end

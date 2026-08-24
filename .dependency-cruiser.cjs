/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-no-apps-import",
      comment: "@notekit/core must not import from apps/* — it is a shared library",
      severity: "error",
      from: {
        path: "^packages/core/",
      },
      to: {
        path: "^apps/",
      },
    },
    {
      name: "api-client-no-react",
      comment: "@notekit/api-client must not import React or DOM — it must remain platform-agnostic",
      severity: "error",
      from: {
        path: "^packages/api-client/",
      },
      to: {
        dependencyTypes: ["npm"],
        path: "^react(-dom)?$",
      },
    },
    {
      name: "no-circular",
      comment: "Circular dependencies cause unpredictable load order and hide coupling",
      severity: "error",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "no-cross-app-web-to-api",
      comment: "apps/web must not reach into apps/api src internals",
      severity: "error",
      from: { path: "^apps/web/src/" },
      to: { path: "^apps/api/src/" },
    },
    {
      name: "no-cross-app-web-to-cli",
      comment: "apps/web must not reach into apps/cli src internals",
      severity: "error",
      from: { path: "^apps/web/src/" },
      to: { path: "^apps/cli/src/" },
    },
    {
      name: "no-cross-app-web-to-mcp",
      comment: "apps/web must not reach into apps/mcp src internals",
      severity: "error",
      from: { path: "^apps/web/src/" },
      to: { path: "^apps/mcp/src/" },
    },
    {
      name: "no-cross-app-web-to-desktop",
      comment: "apps/web must not reach into apps/desktop src internals",
      severity: "error",
      from: { path: "^apps/web/src/" },
      to: { path: "^apps/desktop/src/" },
    },
    {
      name: "no-cross-app-api-to-others",
      comment: "apps/api must not reach into other apps' src internals",
      severity: "error",
      from: { path: "^apps/api/src/" },
      to: { path: "^apps/(web|cli|mcp|desktop|mobile)/src/" },
    },
    {
      name: "no-cross-app-cli-to-others",
      comment:
        "apps/cli must not reach into other apps' src internals. Exception: the CLI's " +
        "`mcp serve` embeds the MCP server in-process via @notekit/mcp's declared public " +
        "exports (./run, ./server) — that is an intentional package-level dependency.",
      severity: "error",
      from: { path: "^apps/cli/src/" },
      to: {
        path: "^apps/(web|api|mcp|desktop|mobile)/src/",
        pathNot: "^apps/mcp/src/(composition/run|adapters/driving/server)\\.ts$",
      },
    },
    {
      name: "no-cross-app-mcp-to-others",
      comment: "apps/mcp must not reach into other apps' src internals",
      severity: "error",
      from: { path: "^apps/mcp/src/" },
      to: { path: "^apps/(web|api|cli|desktop|mobile)/src/" },
    },
    {
      name: "no-cross-app-desktop-to-others",
      comment: "apps/desktop must not reach into other apps' src internals",
      severity: "error",
      from: { path: "^apps/desktop/src/" },
      to: { path: "^apps/(web|api|cli|mcp|mobile)/src/" },
    },
    {
      name: "domain-no-external",
      comment: "packages/core/src/domain/* must not import external npm modules (domain layer is decoupled from frameworks/deps)",
      severity: "error",
      from: { path: "^packages/core/src/domain/" },
      to: {
        dependencyTypes: ["npm"],
        pathNot: "^(uuid|decimal\\.js|node:).*",
      },
    },
    {
      name: "application-no-adapters",
      comment: "packages/core/src/application/* must not import from packages/core/src/adapters/* (inner never imports outer)",
      severity: "error",
      from: { path: "^packages/core/src/application/" },
      to: { path: "^packages/core/src/adapters/" },
    },
    {
      name: "driven-not-driving",
      comment: "packages/core/src/adapters/driven/* must not import from packages/core/src/adapters/driving/* (driven adapters remain passive)",
      severity: "error",
      from: { path: "^packages/core/src/adapters/driven/" },
      to: { path: "^packages/core/src/adapters/driving/" },
    },
    {
      name: "driving-not-driven",
      comment: "packages/core/src/adapters/driving/* must not import from packages/core/src/adapters/driven/* (no reverse coupling)",
      severity: "error",
      from: { path: "^packages/core/src/adapters/driving/" },
      to: { path: "^packages/core/src/adapters/driven/" },
    },
    {
      name: "domain-no-application",
      comment: "packages/core/src/domain/* must not import from packages/core/src/application/* or packages/core/src/adapters/* (inner never imports outer layers)",
      severity: "error",
      from: { path: "^packages/core/src/domain/" },
      to: {
        path: "^packages/core/src/(application|adapters)/",
      },
    },
    {
      name: "api-domain-no-external",
      comment: "apps/api/src/domain/* must not import external npm modules (backend domain layer is framework-decoupled)",
      severity: "error",
      from: { path: "^apps/api/src/domain/" },
      to: {
        dependencyTypes: ["npm"],
        pathNot: "^(uuid|decimal\\.js|node:).*",
      },
    },
    {
      name: "api-domain-no-application",
      comment: "apps/api/src/domain/* must not import from apps/api/src/application/* or apps/api/src/adapters/* (inner never imports outer layers)",
      severity: "error",
      from: { path: "^apps/api/src/domain/" },
      to: { path: "^apps/api/src/(application|adapters)/" },
    },
    {
      name: "api-application-no-adapters",
      comment: "apps/api/src/application/* must not import from apps/api/src/adapters/* (inner never imports outer)",
      severity: "error",
      from: { path: "^apps/api/src/application/" },
      to: { path: "^apps/api/src/adapters/" },
    },
    {
      name: "api-driven-not-driving",
      comment: "apps/api/src/adapters/driven/* must not import from apps/api/src/adapters/driving/* (driven adapters remain passive)",
      severity: "error",
      from: { path: "^apps/api/src/adapters/driven/" },
      to: { path: "^apps/api/src/adapters/driving/" },
    },
    {
      name: "api-driving-not-driven",
      comment: "apps/api/src/adapters/driving/* must not import from apps/api/src/adapters/driven/* (no reverse coupling)",
      severity: "error",
      from: { path: "^apps/api/src/adapters/driving/" },
      to: { path: "^apps/api/src/adapters/driven/" },
    },
    {
      name: "cli-domain-no-external",
      comment: "apps/cli/src/domain/* must not import external npm modules (CLI domain layer is framework-decoupled)",
      severity: "error",
      from: { path: "^apps/cli/src/domain/" },
      to: {
        dependencyTypes: ["npm"],
        pathNot: "^(uuid|decimal\\.js|node:).*",
      },
    },
    {
      name: "cli-domain-no-application",
      comment: "apps/cli/src/domain/* must not import from apps/cli/src/application/* or apps/cli/src/adapters/* (inner never imports outer layers)",
      severity: "error",
      from: { path: "^apps/cli/src/domain/" },
      to: { path: "^apps/cli/src/(application|adapters)/" },
    },
    {
      name: "cli-application-no-adapters",
      comment: "apps/cli/src/application/* must not import from apps/cli/src/adapters/* (inner never imports outer)",
      severity: "error",
      from: { path: "^apps/cli/src/application/" },
      to: { path: "^apps/cli/src/adapters/" },
    },
    {
      name: "cli-driven-not-driving",
      comment: "apps/cli/src/adapters/driven/* must not import from apps/cli/src/adapters/driving/* (driven adapters remain passive)",
      severity: "error",
      from: { path: "^apps/cli/src/adapters/driven/" },
      to: { path: "^apps/cli/src/adapters/driving/" },
    },
    {
      name: "cli-driving-not-driven",
      comment: "apps/cli/src/adapters/driving/* must not import from apps/cli/src/adapters/driven/* (no reverse coupling; driving reaches driven only through composition)",
      severity: "error",
      from: { path: "^apps/cli/src/adapters/driving/" },
      to: { path: "^apps/cli/src/adapters/driven/" },
    },
    {
      name: "mcp-domain-no-external",
      comment: "apps/mcp/src/domain/* must not import external npm modules (MCP domain layer is framework-decoupled)",
      severity: "error",
      from: { path: "^apps/mcp/src/domain/" },
      to: {
        dependencyTypes: ["npm"],
        pathNot: "^(uuid|decimal\\.js|node:).*",
      },
    },
    {
      name: "mcp-domain-no-application",
      comment: "apps/mcp/src/domain/* must not import from apps/mcp/src/application/* or apps/mcp/src/adapters/* (inner never imports outer layers)",
      severity: "error",
      from: { path: "^apps/mcp/src/domain/" },
      to: { path: "^apps/mcp/src/(application|adapters)/" },
    },
    {
      name: "mcp-application-no-adapters",
      comment: "apps/mcp/src/application/* must not import from apps/mcp/src/adapters/* (inner never imports outer)",
      severity: "error",
      from: { path: "^apps/mcp/src/application/" },
      to: { path: "^apps/mcp/src/adapters/" },
    },
    {
      name: "mcp-driven-not-driving",
      comment: "apps/mcp/src/adapters/driven/* must not import from apps/mcp/src/adapters/driving/* (driven adapters remain passive)",
      severity: "error",
      from: { path: "^apps/mcp/src/adapters/driven/" },
      to: { path: "^apps/mcp/src/adapters/driving/" },
    },
    {
      name: "mcp-driving-not-driven",
      comment: "apps/mcp/src/adapters/driving/* must not import from apps/mcp/src/adapters/driven/* (no reverse coupling; driving reaches driven only through composition)",
      severity: "error",
      from: { path: "^apps/mcp/src/adapters/driving/" },
      to: { path: "^apps/mcp/src/adapters/driven/" },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules|dist|build",
    },
    // Generated / build output & native-synced webviews — never hand-authored,
    // mirror the eslint.config.js ignores. Bundled chunks are legitimately
    // circular and would drown the real source-level findings.
    exclude: {
      path: [
        "node_modules",
        "\\.d\\.ts$",
        "/dist/",
        "/build/",
        "/\\.next/",
        "/\\.turbo/",
        "/DerivedData/",
        "apps/mobile/ios/App/App/public/",
        "apps/mobile/android/app/src/main/assets/public/",
        "apps/landing/",
        "apps/backoffice/",
        "\\.min\\.js$",
        "\\.test\\.(ts|tsx)$",
      ],
    },
    tsConfig: {
      fileName: "tsconfig.base.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/[^/]+",
      },
    },
  },
};

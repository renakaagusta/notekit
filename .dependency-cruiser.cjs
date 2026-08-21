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
        pathNot: "^apps/mcp/src/(run|server)\\.ts$",
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

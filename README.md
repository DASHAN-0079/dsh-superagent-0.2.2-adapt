# dsh-superagent

> **Research prototype for reference only, not an official DeepSeek product.** This code grew out of our team's day-to-day development work, with much of the engineering done by coding agents. Treat it as research code, not production-ready software. It may still contain bugs, and its coding style and engineering practices may be inconsistent. Review and adapt it before using it in your own environment.
>
> We have adapted it for publication, so it is not identical to our internal version or the implementation described in *Exploring Super-agent Design: Towards a More Autonomous Agent System*. Some designs discussed in the article are directions for future development and are not implemented in this prototype.
>
> **About this checkout:** this is a community adaptation of the official [prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) to DeepSeek Harness `0.2.2-rc.3`. The upstream repository has issues and pull requests disabled, so it cannot take this adaptation directly; this fork-like checkout carries it instead. See [ADAPTATION.md](ADAPTATION.md) for the change list and the equivalence evidence.

dsh-superagent is a proactive coding agent for one GitHub repository, packaged as a bundle for [DeepSeek Harness](https://www.deepseek.com/en/harness/). It listens to GitHub and, optionally, Feishu. When someone allowed asks the agent for work, it opens a work item, works on it in its own agent session and directory, and answers in the original conversation, for example with a pull request. A web panel shows what needs a person.

It is also a way of working with an agent: **take as little human attention as possible, and give as much value as possible.** An agent that can act for a whole team can also waste a whole team's attention, so it acts only when asked or when a rule the team wrote allows it, and speaks only when someone must act or can use a result. [docs/000-philosophy.md](docs/000-philosophy.md) explains the principle and what it asks of the operator.

> **Installing from Git or the plugin index.** From `0.1.1` this checkout commits its built `lib/` output, so a Git
> install loads the shipped bundle: no build step and no pnpm build approval is involved. Rebuild only when you
> change the sources.
>
> **Building from source.** This checkout targets DeepSeek Harness `0.2.2-rc.3`. The
> `@deepseek-ai/*@0.2.2-rc.3` tarballs are on npm but lag the tagged host (the webserver types there lack the
> `auth` route field), so a plain `pnpm install` against npm is not enough: add this checkout to a dsh workspace
> (`pnpm-workspace.yaml`) with top-level `linkWorkspacePackages: true`, run `pnpm update --filter dsh-superagent`,
> and build there, so `@deepseek-ai/*` resolves to the workspace **source**. `engines.dsh`, the DSH peers
> (including the new `@deepseek-ai/dsh-error`), `cordis@4.1.0` and `schemastery@3.19.0` are pinned to that host.

## Install

### From a plugin index

This bundle is listed in a community plugin index:

```
https://raw.githubusercontent.com/DASHAN-0079/dsh-plugin-market/main/index.json
```

Open **Plugins**, select the **Discover** tab, then **Manage index sourcesâ€?* (or **Add index source** on the
empty state), paste that URL, and **Add**. **Superagent** then appears in Discover; **Install** adds it to the
profile at the commit the index pins. The same install by hand is

```sh
dsh plugin add "git+https://github.com/DASHAN-0079/dsh-superagent-adapt.git#v0.1.1"
```

DeepSeek Harness has no self-service official marketplace: its built-in catalog only lists the
`@deepseek-ai/dsh-*` packages that ship in the DSH repository, so a community index is the supported way to
publish outside that set. Discover belongs to the experimental plugin-manager bundle; enable it under
**Settings â†?Plugins** if the tab is missing.

### By hand

`dsh plugin add "git+https://github.com/DASHAN-0079/dsh-superagent-adapt.git#v0.1.1"` installs the bundle from
the pinned commit. Afterwards restart the host and configure the deployment: the bundle needs a GitHub token,
model roles and permissions before it runs, which [Setup](#setup) walks through.

## Setup

Setup has many steps, so an agent does it with you. Ask your coding agent:

> Read SETUP.md in this repository and set up dsh-superagent with me.

It asks one short question at a time, shows the full plan once, and then installs and configures everything. [SETUP.md](SETUP.md) is what it follows.

## Adaptation to DeepSeek Harness 0.2.2-rc.3

This checkout is adapted to `0.2.2-rc.3`: read [ADAPTATION.md](ADAPTATION.md) for the five source changes, the
added tests, and the equivalence evidence with its stated ceilings. Signed review artifacts are in
[docs/adaptation](docs/adaptation).

## Documentation

Read the numbered documents in order; each builds only on the ones before it.

- [000 Philosophy](docs/000-philosophy.md)
- [001 Domain model](docs/001-domain.md)
- [002 Authorization](docs/002-authorization.md)
- [003 Execution](docs/003-execution.md)
- [004 Prompts](docs/004-prompts.md)
- [005 Panel](docs/005-panel.md)
- [006 Deployment](docs/006-deployment.md): manual setup, configuration, upgrades and troubleshooting
- [007 Architecture](docs/007-architecture.md)
- [008 Cookbook](docs/008-cookbook.md): adding a Source

## Development

`pnpm check` runs the typecheck, the tests and the build.

## License

[MIT](LICENSE)

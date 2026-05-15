// @ts-nocheck
import { default as __fd_glob_42 } from "../content/docs/platform/projects/meta.json?collection=docs"
import { default as __fd_glob_41 } from "../content/docs/platform/agents/meta.json?collection=docs"
import { default as __fd_glob_40 } from "../content/docs/routines/meta.json?collection=docs"
import { default as __fd_glob_39 } from "../content/docs/introduction/meta.json?collection=docs"
import { default as __fd_glob_38 } from "../content/docs/harness/meta.json?collection=docs"
import { default as __fd_glob_37 } from "../content/docs/getting-started/meta.json?collection=docs"
import { default as __fd_glob_36 } from "../content/docs/api/meta.json?collection=docs"
import { default as __fd_glob_35 } from "../content/docs/agents/meta.json?collection=docs"
import { default as __fd_glob_34 } from "../content/docs/meta.json?collection=docs"
import * as __fd_glob_33 from "../content/docs/platform/projects/tasks.mdx?collection=docs"
import * as __fd_glob_32 from "../content/docs/platform/projects/repositories.mdx?collection=docs"
import * as __fd_glob_31 from "../content/docs/platform/projects/index.mdx?collection=docs"
import * as __fd_glob_30 from "../content/docs/platform/projects/executions.mdx?collection=docs"
import * as __fd_glob_29 from "../content/docs/platform/projects/documents.mdx?collection=docs"
import * as __fd_glob_28 from "../content/docs/platform/projects/context-and-settings.mdx?collection=docs"
import * as __fd_glob_27 from "../content/docs/platform/agents/prompt-templating.mdx?collection=docs"
import * as __fd_glob_26 from "../content/docs/platform/agents/prompt-config.mdx?collection=docs"
import * as __fd_glob_25 from "../content/docs/platform/agents/models.mdx?collection=docs"
import * as __fd_glob_24 from "../content/docs/platform/agents/memory.mdx?collection=docs"
import * as __fd_glob_23 from "../content/docs/platform/agents/mcp.mdx?collection=docs"
import * as __fd_glob_22 from "../content/docs/platform/agents/index.mdx?collection=docs"
import * as __fd_glob_21 from "../content/docs/platform/agents/domains.mdx?collection=docs"
import * as __fd_glob_20 from "../content/docs/platform/agents/abilities.mdx?collection=docs"
import * as __fd_glob_19 from "../content/docs/platform/organizations/security.mdx?collection=docs"
import * as __fd_glob_18 from "../content/docs/platform/organizations/index.mdx?collection=docs"
import * as __fd_glob_17 from "../content/docs/routines/step-types.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/routines/index.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/routines/executions.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/routines/edges-and-conditions.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/routines/dag-validation.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/routines/cron-and-scheduling.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/platform/scopes.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/harness/worker.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/harness/worker-config.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/harness/sdk.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/harness/manifests.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/harness/index.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/harness/crates.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/introduction/nenji.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/introduction/building-blocks.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/getting-started/onboarding.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/getting-started/bootstrap.mdx?collection=docs"
import * as __fd_glob_0 from "../content/docs/index.mdx?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_34, "agents/meta.json": __fd_glob_35, "api/meta.json": __fd_glob_36, "getting-started/meta.json": __fd_glob_37, "harness/meta.json": __fd_glob_38, "introduction/meta.json": __fd_glob_39, "routines/meta.json": __fd_glob_40, "platform/agents/meta.json": __fd_glob_41, "platform/projects/meta.json": __fd_glob_42, }, {"index.mdx": __fd_glob_0, "getting-started/bootstrap.mdx": __fd_glob_1, "getting-started/onboarding.mdx": __fd_glob_2, "introduction/building-blocks.mdx": __fd_glob_3, "introduction/nenji.mdx": __fd_glob_4, "harness/crates.mdx": __fd_glob_5, "harness/index.mdx": __fd_glob_6, "harness/manifests.mdx": __fd_glob_7, "harness/sdk.mdx": __fd_glob_8, "harness/worker-config.mdx": __fd_glob_9, "harness/worker.mdx": __fd_glob_10, "platform/scopes.mdx": __fd_glob_11, "routines/cron-and-scheduling.mdx": __fd_glob_12, "routines/dag-validation.mdx": __fd_glob_13, "routines/edges-and-conditions.mdx": __fd_glob_14, "routines/executions.mdx": __fd_glob_15, "routines/index.mdx": __fd_glob_16, "routines/step-types.mdx": __fd_glob_17, "platform/organizations/index.mdx": __fd_glob_18, "platform/organizations/security.mdx": __fd_glob_19, "platform/agents/abilities.mdx": __fd_glob_20, "platform/agents/domains.mdx": __fd_glob_21, "platform/agents/index.mdx": __fd_glob_22, "platform/agents/mcp.mdx": __fd_glob_23, "platform/agents/memory.mdx": __fd_glob_24, "platform/agents/models.mdx": __fd_glob_25, "platform/agents/prompt-config.mdx": __fd_glob_26, "platform/agents/prompt-templating.mdx": __fd_glob_27, "platform/projects/context-and-settings.mdx": __fd_glob_28, "platform/projects/documents.mdx": __fd_glob_29, "platform/projects/executions.mdx": __fd_glob_30, "platform/projects/index.mdx": __fd_glob_31, "platform/projects/repositories.mdx": __fd_glob_32, "platform/projects/tasks.mdx": __fd_glob_33, });
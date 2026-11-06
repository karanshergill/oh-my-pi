import type { Project } from "@caido/sdk-client";
import { parse } from "graphql";
import { connectCaido } from "./client.ts";

const result = await (await connectCaido()).graphql.query<{
  currentProject: {
    project: Pick<Project, "id" | "name" | "readOnly"> | null;
  } | null;
}, Record<string, never>>(parse(`query CurrentProject {
  currentProject { project { id name readOnly } }
}`));

console.log(JSON.stringify(result.currentProject?.project ?? null));

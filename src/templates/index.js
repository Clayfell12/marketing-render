// Template registry. Every template the service can render is registered here.
// Adding a template = write the component, import it, add one line.

import { pipelineHero } from "./dt-pipeline-hero.js";

export const templates = {
  "dt-pipeline-hero": pipelineHero,
};

export default templates;

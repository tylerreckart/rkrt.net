import config from "@config";
import fs from "fs";
import path from "path";
import pug from "pug";
import colors from "colors";
import getReading from "@app/utils/get-reading";
import fetchCovers from "@app/utils/fetch-covers";
import fetchSnippets from "@app/utils/fetch-snippets";

const render = pug.compileFile(
  path.join(`${__dirname}/../../templates/reading.pug`)
);

/**
 * Render the reading history page from the Goodreads export.
 */
export default async function buildReading(outdir: string): Promise<void> {
  if (!fs.existsSync(`${outdir}/reading`)) {
    fs.mkdirSync(`${outdir}/reading`);
  }

  const reading = await fetchSnippets(await fetchCovers(getReading()));

  const page = render({
    ...reading,
    ...config,
  });

  fs.writeFileSync(`${outdir}/reading/index.html`, page);
  console.log(colors.cyan("[page] reading built"));
}

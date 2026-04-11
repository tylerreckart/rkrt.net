import config from "@config";
import fs from "fs";
import path from "path";
import pug from "pug";
import colors from "colors";
import { generateNextPost } from "@src/app/post";
import { Post as PostType } from "@src/types/post";

const renderHomepage = pug.compileFile(
  path.join(`${__dirname}/../../templates/home.pug`)
);

/**
 * Create a preview excerpt from post body
 */
function createPreview(body: string): string {
  // Get first 2-3 paragraphs or ~1200 characters
  const paragraphs = body.match(/<p>.*?<\/p>/gs);

  if (paragraphs && paragraphs.length >= 2) {
    // Return first 2-3 paragraphs
    const preview = paragraphs.slice(0, 2).join('\n');
    if (preview.length < 1500) {
      return preview;
    }
  }

  // Fallback: truncate at ~1200 chars at paragraph boundary
  const truncated = body.substring(0, 1200);
  const lastParagraphEnd = truncated.lastIndexOf('</p>');

  if (lastParagraphEnd > 0) {
    return truncated.substring(0, lastParagraphEnd + 4);
  }

  return body.substring(0, 1000) + '...';
}

/**
 * Render the homepage.
 *
 * @param {object} post - The most recent post to be rendered.
 */
export default function buildHome(
  posts: Array<PostType>,
  outdir: string
): void {
  const latestPost = {
    ...posts[0],
    preview: createPreview(posts[0].body)
  };

  const homepage = renderHomepage({ ...latestPost, ...config, nextPost: generateNextPost(posts[1]) });

  fs.writeFile(`${outdir}/index.html`, homepage, (error: any): void => {
    if (error) {
      throw error;
    }

    console.log(colors.cyan("[page] home built"));
  });
}

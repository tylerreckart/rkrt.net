import config from "@config";
import colors from "colors";
import fs from "fs";
import path from "path";
import pug from "pug";
import { Post as PostType } from "@src/types/post";

const renderPost = pug.compileFile(
  path.join(`${__dirname}/../templates/post.pug`)
);

type Markdown = {
  attributes: Record<string, unknown>;
  path: string;
  body: string;
};

/**
 * Build the content for the `nextPost` property that allows previous posts
 * to be directly linked to on post pages.
 *
 * @param {object} post - The post to be parsed.
 *
 * @returns {object} The formatted post.
 */
export function generateNextPost(post: Markdown): PostType | null {
  if (!post) {
    return null;
  }

  const { attributes, path, body } = post;

  return {
    attributes,
    path,
    body: body
      .split("<p>")
      .slice(0, 2)
      .filter((str) => !str.includes("<img"))
      .join("<p>"),
  };
}

/**
 * Take the post content, render the HTML markup and write the file to the
 * target directory.
 *
 * @param {array} posts - The posts to be rendered.
 */
export default function buildPosts(
  posts: Array<PostType>,
  outdir: string
): void {
  // Check to see if the blog directory has been built previously.
  if (!fs.existsSync(`${outdir}/posts`)) {
    // If the directory does not exist, build it.
    fs.mkdirSync(`${outdir}/posts`);
  }

  const remappedPosts = posts
    .filter((post: PostType) => post.attributes.published)
    .map((post: PostType, index: number) => {
      return {
        ...post,
        ...config,
        nextPost: generateNextPost(posts[index + 1]),
      };
    });

  remappedPosts.forEach((post: PostType) => {
    if (!fs.existsSync(`${outdir}/posts/${post.path}`)) {
      fs.mkdirSync(`${outdir}/posts/${post.path}`);
    }

    fs.writeFile(
      `${outdir}/posts/${post.path}/index.html`,
      renderPost(post),
      (error: unknown): void => {
        if (error) {
          throw error;
        }

        console.log(colors.cyan(`[post] ${post.path} built`));
      }
    );
  });
}

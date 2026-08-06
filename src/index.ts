import "module-alias/register";
import path from "path";
import fs from "fs";
import colors from "colors";
import buildArchive from "@app/routes/archive";
import buildAssets from "@app/assets";
import buildPages from "@app/page";
import buildPosts from "@app/post";
import buildHome from "@app/routes/home";
import buildReading from "@app/routes/reading";
import buildFeed from "@app/feed";
import build404 from "@app/routes/404";
import getPosts from "@app/utils/get-posts";
import getPages from "@app/utils/get-pages";
import { Post as PostType } from "@src/types/post";
import { Page as PageType } from "@src/types/page";

const outdir: string = path.resolve(`${__dirname}/../build`);

// Check to see if the `build` directory exists.
if (!fs.existsSync(outdir)) {
  // If the directory does not exist, create it.
  fs.mkdirSync(outdir);
}

const imagesDir = `${__dirname}/../images`;
const images = fs.readdirSync(imagesDir);

if (images) {
  if (!fs.existsSync(`${outdir}/images`)) {
    fs.mkdirSync(`${outdir}/images`);
  }

  images.forEach((image) => {
    const source = `${imagesDir}/${image}`;
    if (fs.statSync(source).isFile()) {
      fs.copyFileSync(source, `${outdir}/images/${image}`);
    }
  });
}

const posts: Array<PostType> = getPosts();
const pages: Array<PageType> = getPages();

export async function bundleAssets(): Promise<void> {
  try {
    console.log(colors.yellow("[bundle] building..."));

    // build static assets
    buildAssets(outdir);
    // build pages
    buildHome(posts, outdir);
    buildArchive(posts, outdir);
    await buildReading(outdir);
    // Covers land in images/covers during reading build; copy after fetch.
    const coverDir = `${__dirname}/../images/covers`;
    if (fs.existsSync(coverDir)) {
      if (!fs.existsSync(`${outdir}/images/covers`)) {
        fs.mkdirSync(`${outdir}/images/covers`, { recursive: true });
      }

      fs.readdirSync(coverDir).forEach((image) => {
        fs.copyFileSync(
          `${coverDir}/${image}`,
          `${outdir}/images/covers/${image}`
        );
      });
    }
    buildPosts(posts, outdir);
    buildPages(pages, outdir);
    // rss/json feeds
    buildFeed(posts, outdir);
    // 404 page
    build404(outdir);
  } catch (error) {
    console.log(colors.red("[bundle] build failed"));
    console.error(error);

    return;
  }
}

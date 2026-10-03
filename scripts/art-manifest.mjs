// Writes public/assets/hd/manifest.json: the image files that the game loads in place of placeholder art.
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

for (const set of ['hd']) {
  const root = join('public/assets', set);
  if (!existsSync(root)) continue;
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(png|webp|jpg)$/i.test(name)) files.push(relative(root, path).split('\\').join('/'));
    }
  };
  walk(root);
  files.sort();
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({ files }, null, 2) + '\n');
  console.log(`${files.length} image files listed in ${root}/manifest.json`);
}

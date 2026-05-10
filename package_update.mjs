// node package_update.mjs <folder1> ...

import {
  access,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { get } from 'node:https';

const FILES_TO_CHECK = ['package.json', 'package-basic.json'];

async function processPackages(projectFolders) {
  // Get all files
  
  let files = {};
  
  for (const folder of projectFolders) {
    for (const file of FILES_TO_CHECK) {
      const path = folder + '/' + file;
      if (await access(path)) {
        const fileText = (await readFile(path)).toString();
        const fileJson = JSON.parse(fileText);
        if ('dependencies' in fileJson) {
          console.log(`Processing file ${path}`);
          const fileLines = fileText.split(/\r?\n/);
          let fileBlankLines = [];
          for (let i = 0; i < fileLines.length; i++) {
            if (/^ +$/.test(fileLines[i])) fileBlankLines.push(i);
          }
          files[path] = {
            text: fileText,
            json: fileJson,
            line: fileLines,
            blankLines: fileBlankLines,
          };
        }
      }
    }
  }
  
  // Get packages
  
  let packages = new Set();
  
  for (const file of Object.values(files)) {
    Object.keys(file.json.dependencies).forEach(x => packages.add(x));
  }
  
  // Get package info
  
  let packageVersion = {};
  
  for (const packageName of packages) {
    console.log(`Getting package ${packageName}`);
    packageVersion[packageName] = await new Promise(r => {
      get(`https://registry.npmjs.org/${packageName}`, {
        headers: {
          'accept': 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
        },
      }, res => {
        let chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => r(JSON.parse(Buffer.concat(chunks).toString())['dist-tags'].latest));
      });
    });
  }
  
  // Replace version numbers
  
  for (const file of Object.values(files)) {
    for (const packageName in file.json.dependencies) {
      file.json.dependencies[packageName] = '^' + packageVersion[packageName];
    }
    file.lines = JSON.stringify(file.json, null, 2).split('\n');
    for (const line of file.blankLines) {
      file.lines.splice(line, 0, '    ');
    }
    file.text = file.lines.join('\n') + '\n';
  }
  
  // Replace files
  
  for (const path in files) {
    console.log(`Updating file ${path}`);
    await writeFile(path, files[path].text);
  }
}

if (process.argv.length == 2 || process.argv[2] == '--help') {
  console.log('arguments: node package_update.js <folder1> ...');
} else {
  processPackages(process.argv.slice(2));
}

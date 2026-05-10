// node package_update.mjs <folder1> ...

import {
  access,
  readdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import { get } from 'node:https';
import {
  basename,
  dirname,
} from 'node:path';

const FILES_TO_CHECK = ['package.json', 'package-basic.json'];
const DEPS_TO_CHECK = ['dependencies', 'optionalDependencies', 'devDependencies'];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (err) {
    if (err.code == 'ENOENT') {
      return false;
    } else {
      throw err;
    }
  }
}

async function getTempPath(path) {
  const folderPath = dirname(path);
  const fileName = basename(path);
  
  const folderFiles = new Set(await readdir(folderPath));
  
  let tempPath;
  
  let index = 0;
  
  while (folderFiles.has(tempPath = `${folderPath}/${fileName}.tmp.${index}`)) {
    index++;
  }
  
  return tempPath;
}

async function processPackages(projectFolders) {
  // Get all files
  
  let files = new Map();
  
  for (const folder of projectFolders) {
    for (const file of FILES_TO_CHECK) {
      const path = folder + '/' + file;
      
      console.log(`Processing file ${path}`);
      
      if (await exists(path)) {
        const fileText = (await readFile(path)).toString();
        const fileJson = JSON.parse(fileText);
        const fileLines = fileText.split(/\r?\n/);
        
        let fileBlankLines = [];
          
        for (let i = 0; i < fileLines.length; i++) {
          if (/^ +$/.test(fileLines[i])) fileBlankLines.push(i);
        }
        
        files.set(
          path,
          {
            text: fileText,
            json: fileJson,
            line: fileLines,
            blankLines: fileBlankLines,
          },
        );
      }
    }
  }
  
  // Get packages
  
  let packages = new Set();
  
  for (const { json } of files.values()) {
    for (const { dependencyPath } of DEPS_TO_CHECK) {
      Object.keys(json[dependencyPath]).forEach(x => packages.add(x));
    }
  }
  
  // Get package info
  
  let packageVersion = new Map();
  
  for (const packageName of packages) {
    console.log(`Getting package ${packageName}`);
    
    packageVersion.set(
      packageName,
      await new Promise(r => {
        get(`https://registry.npmjs.org/${packageName}`, {
          headers: {
            'accept': 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
          },
        }, res => {
          let chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => r(JSON.parse(Buffer.concat(chunks).toString())['dist-tags'].latest));
        });
      }),
    );
  }
  
  // Replace version numbers
  
  for (const file of files.values()) {
    const { json, blankLines } = file;
    
    for (const packageName in json.dependencies) {
      json.dependencies[packageName] = '^' + packageVersion[packageName];
    }
    
    const newLines =
      JSON.stringify(file.json, null, 2)
      .split('\n');
    
    for (const line of blankLines) {
      newLines.splice(line, 0, '    ');
    }
    
    file.newText =
      newLines.join('\n') +
      '\n';
  }
  
  // Replace files
  
  for (const [ path, newText ] in files) {
    console.log(`Updating file ${path}`);
    
    const tempPath = await getTempPath(path);
    
    await writeFile(tempPath, newText);
    await rename(tempPath, path);
  }
}

if (process.argv.length == 2 || process.argv[2] == '--help') {
  console.log('arguments: node package_update.js <folder1> ...');
} else {
  processPackages(process.argv.slice(2));
}

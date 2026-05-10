// node package_update.mjs <folder1> ...

import {
  access,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { get } from 'node:https';

const filesToCheck = ['package.json', 'package-basic.json'];

async function processPackages(projectFolders) {
  var file, packageName, path;
  
  // get all files
  var files = {};
  
  for (var folder of projectFolders) {
    for (file of filesToCheck) {
      path = folder + '/' + file;
      if (await access(path)) {
        var fileText = (await readFile(path)).toString();
        var fileJson = JSON.parse(fileText);
        if ('dependencies' in fileJson) {
          console.log(`Processing file ${path}`);
          var fileLines = fileText.split(/\r?\n/);
          var fileBlankLines = [];
          for (var i = 0; i < fileLines.length; i++)
            if (/^ +$/.test(fileLines[i])) fileBlankLines.push(i);
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
  
  // get packages
  var packages = new Set();
  
  for (file of Object.values(files))
    Object.keys(file.json.dependencies).forEach(x => packages.add(x));
  
  // get package info
  var packageVersion = {};
  
  for (packageName of packages) {
    console.log(`Getting package ${packageName}`);
    packageVersion[packageName] = await new Promise(r => {
      get(`https://registry.npmjs.org/${packageName}`, {
        headers: {
          'accept': 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
        },
      }, res => {
        var chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => r(JSON.parse(Buffer.concat(chunks).toString())['dist-tags'].latest));
      });
    });
  }
  
  // replace version numbers
  for (file of Object.values(files)) {
    for (packageName in file.json.dependencies)
      file.json.dependencies[packageName] = '^' + packageVersion[packageName];
    file.lines = JSON.stringify(file.json, null, 2).split('\n');
    for (var line of file.blankLines)
      file.lines.splice(line, 0, '    ');
    file.text = file.lines.join('\n') + '\n';
  }
  
  // replace files
  for (path in files) {
    console.log(`Updating file ${path}`);
    await writeFile(path, files[path].text);
  }
}

if (process.argv.length == 2 || process.argv[2] == '--help') {
  console.log('arguments: node package_update.js <folder1> ...');
} else {
  processPackages(process.argv.slice(2));
}

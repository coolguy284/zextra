// node convert_to_lf.js <folderPath> [ensureEndingNewline = true]

var fs = require('fs');

var recursiveReaddir = require('./lib/recursive_readdir');

// dev only added for yiyo.dev file on c284-webmain-1
var VALID_FILETYPES = new Set(['Dockerfile', 'LICENSE', 'css', 'dev',  'dockerignore', 'gitignore', 'html', 'js', 'json', 'list', 'map', 'md', 'sh', 'txt', 'xml']);

function convertFolder(folderPath, ensureEndingNewline) {
  var files = recursiveReaddir(folderPath, ['.git', '.vs'])
    .filter(x =>
      VALID_FILETYPES.has(x.split('.').slice(-1)[0]) &&
      !/(?:^|\/)node_modules\//.test(x)
    );
  
  for (var filePath of files) {
    let fullFilePath = folderPath + '/' + filePath;
    
    let fileLines = fs.readFileSync(fullFilePath).toString().split(/\r?\n/);
    
    if (ensureEndingNewline && fileLines.slice(-1)[0] != '')
      fileLines.push('');
    
    fs.writeFileSync(fullFilePath, fileLines.join('\n'));
  }
}

if (process.argv.length == 2 || process.argv[2] == '--help') {
  console.log('arguments: node convert_to_lf.js <folderPath> [ensureEndingNewline = true]');
} else {
  convertFolder(process.argv[2], process.argv[3] == 'true' || process.argv[3] == null);
}

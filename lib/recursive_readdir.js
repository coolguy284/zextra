var fs = require('fs');

module.exports = function recursiveReaddir(filePath, excludeDirs, logDir) {
  if (logDir) console.log(filePath);
  
  try {
    if (!excludeDirs) excludeDirs = [];
    
    var currentExcludeDirs = excludeDirs.filter(x => !x.includes('/'));
    
    var contents = fs.readdirSync(filePath, { withFileTypes: true }).filter(x => !currentExcludeDirs.includes(x.name));
    
    var folders = [], files = [];
    
    contents.forEach(x => x.isDirectory() && !x.isSymbolicLink() ? folders.push(x) : files.push(x));
    
    return [
      ...folders.map(x =>
        recursiveReaddir(
          filePath + '/' + x.name,
          excludeDirs
            .filter(x => x.startsWith(x))
            .map(x => x.split('/').slice(1).join('/')),
          logDir
        )
        .map(y => x.name + '/' + y)
      )
      .reduce((a, c) => (c.forEach(x => a.push(x)), a), []),
      ...files.map(x => x.name)
    ];
  } catch (e) {
    console.error(e);
    return [];
  }
};

var fs = require('fs');

module.exports = (() => {
  /**
   * @enum {ErrorBehavior}
   */
  let ErrorBehavior = {
    QUIT_ON_ERROR: 0,
    SHOW_ERROR_BUT_CONTINUE: 1,
    SUPPRESS_ERROR: 2,
  };
  
  recursiveReaddir.ErrorBehavior = ErrorBehavior;
  
  /**
   * Recursively reads all filenames in a directory (including subdirectories) and returns an array of the filenames.
   * 
   * @param {Object|string} opts If opts is an object, it contains configuration options for the readdir operation. If string, it is the root filepath to read files from.
   * @param {string} opts.filePath The filepath of the root directory to read files from.
   * @param {string[]} [opts.excludeDirs=[]] An array of directory filepaths to exclude from the readdir operation (including subfolders). The path is relative to the root directory (opts.filePath)
   * @param {boolean} [opts.logDirs=false] If true, each directory path will be logged to console.
   * @param {boolean} [opts.includeFolders=false] If true, subfolders will be directly included in the returned array, not just the files within them.
   * @param {ErrorBehavior} [opts.errorBehavior=ErrorBehavior.SHOW_ERROR_BUT_CONTINUE] Specifies what actions to take when encountering a filesystem error.
   * 
   * @returns {string[]} An array of every filepath inside the root directory (opts.filePath).
   */
  function recursiveReaddir(opts) {
    // Check and sanitize opts
    
    if (typeof opts == 'string') {
      opts = { filePath: opts };
    } else if (typeof opts != 'object') {
      throw new Error('Opts must be object or string (filepath)');
    }
    
    if (!('filePath' in opts)) {
      throw new Error('opts.filePath must exist');
    }
    
    if ('excludeDirs' in opts && !Array.isArray(opts.excludeDirs)) {
      throw new Error('opts.excludeDir must be array or null');
    }
    
    if ('logDirs' in opts && typeof opts.logDirs != 'boolean') {
      throw new Error('opts.logDirs must be boolean or null');
    }
    
    if ('includeFolders' in opts && typeof opts.includeFolders != 'boolean') {
      throw new Error('opts.includeFolders must be boolean or null');
    }
    
    if ('errorBehavior' in opts && (typeof opts.errorBehavior != 'number' || !Number.isSafeInteger(opts.errorBehavior) || opts.errorBehavior < 0 || opts.errorBehavior > 2)) {
      throw new Error('opts.errorBehavior must be recursiveReaddir.ErrorBehavior enum or null');
    }
    
    opts = {
      filePath: opts.filePath,
      excludeDirs: opts.excludeDirs ?? [],
      logDirs: opts.logDirs ?? false,
      includeFolders: opts.includeFolders ?? false,
      errorBehavior: opts.errorBehavior ?? ErrorBehavior.SHOW_ERROR_BUT_CONTINUE,
    };
    
    // Handoff calculations to internal function
    
    return recursiveReaddirInternal(opts);
  }
  
  // Internal function, takes same opts object as main recursiveReaddir function
  function recursiveReaddirInternal(opts) {
    if (opts.logDir) {
      console.log(opts.filePath);
    }
    
    let subFiles;
    
    try {
      var currentExcludeDirs = opts.excludeDirs.filter(x => !x.includes('/'));
      
      var contents = fs.readdirSync(opts.filePath, { withFileTypes: true }).filter(x => !currentExcludeDirs.includes(x.name));
      
      var folders = [], files = [];
      
      contents.forEach(x => x.isDirectory() && !x.isSymbolicLink() ? folders.push(x) : files.push(x));
      
      subFiles = [
        ...folders.map(x => {
          let result = recursiveReaddir({
            ...opts,
            filePath: opts.filePath + '/' + x.name,
            excludeDirs: opts.excludeDirs
              .filter(x => x.startsWith(x))
              .map(x => x.split('/').slice(1).join('/')),
          });
          
          if (opts.includeFolders) {
            result = result.map(y => (x.name + '/' + y).replace(/\/\.$/, ''));
          } else {
            result = result.map(y => x.name + '/' + y);
          }
          
          return result;
        })
        .reduce((a, c) => (c.forEach(x => a.push(x)), a), []),
        ...files.map(x => x.name)
      ];
    } catch (e) {
      switch (opts.errorBehavior) {
        case ErrorBehavior.QUIT_ON_ERROR:
          throw e;
        
        case ErrorBehavior.SHOW_ERROR_BUT_CONTINUE:
          console.error(e);
          return [];
        
        case ErrorBehavior.SUPPRESS_ERROR:
          return [];
      }
    }
    
    if (opts.includeFolders) {
      return [
        '.',
        ...subFiles,
      ];
    } else {
      return subFiles;
    }
  }
  
  return recursiveReaddir;
})();

let fs = require('fs');

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
   * @param {boolean} [opts.withFileTypes=false] If true, then the returned array will contain subarrays of [filepath, dirent] pairs instead of just filenames.
   * @param {boolean} [opts.asyncMode=false] If true, this function returns a promise that resolves to the returned array instead.
   * @param {ErrorBehavior} [opts.errorBehavior=ErrorBehavior.SHOW_ERROR_BUT_CONTINUE] Specifies what actions to take when encountering a filesystem error.
   * 
   * @returns {string[]|[string, fs.Dirent][]|Promise<string[]|[string, fs.Dirent][]>} An array of every filepath inside the root directory (opts.filePath).
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
    
    if ('withFileTypes' in opts && typeof opts.withFileTypes != 'boolean') {
      throw new Error('opts.withFileTypes must be boolean or null');
    }
    
    if ('asyncMode' in opts && typeof opts.asyncMode != 'boolean') {
      throw new Error('opts.asyncMode must be boolean or null');
    }
    
    if ('errorBehavior' in opts && (typeof opts.errorBehavior != 'number' || !Number.isSafeInteger(opts.errorBehavior) || opts.errorBehavior < 0 || opts.errorBehavior > 2)) {
      throw new Error('opts.errorBehavior must be recursiveReaddir.ErrorBehavior enum or null');
    }
    
    let internalOpts = {
      filePath: opts.filePath,
      excludeDirs: opts.excludeDirs ?? [],
      logDirs: opts.logDirs ?? false,
      includeFolders: opts.includeFolders ?? false,
      withFileTypes: opts.withFileTypes ?? false,
      errorBehavior: opts.errorBehavior ?? ErrorBehavior.SHOW_ERROR_BUT_CONTINUE,
      
      _ownFolderName: '.',
    };
    
    // Handoff calculations to internal functions
    
    if (opts.asyncMode) {
      return recursiveReaddirInternalAsync(internalOpts);
    } else {
      return recursiveReaddirInternal(internalOpts);
    }
  }
  
  // Internal function, takes same opts object as main recursiveReaddir function
  function recursiveReaddirInternal(opts) {
    if (opts.logDir) {
      console.log(opts.filePath);
    }
    
    let subFiles;
    
    try {
      let contents = fs.readdirSync(opts.filePath, { withFileTypes: true });
      
      let [ folders, files ] = recursiveReaddirInternal_FilterSortDirents(opts, contents);
      
      subFiles = [
        ...folders.map(x => {
          let result = recursiveReaddirInternal(recursiveReaddirInternal_GenerateSubOpts(opts, x));
            
          return recursiveReaddirInternal_FoldersPostProcess(opts, x, result);
        })
        .flat(),
        ...recursiveReaddirInternal_FilesPostProcess(opts, files),
      ];
    } catch (e) {
      let res = recursiveReaddirInternal_HandleError(opts, e);
      
      if (res != null) {
        return res;
      }
    }
    
    return recursiveReaddirInternal_FinalProcessing(opts, subFiles);
  }
  
  // Promise version of recursiveReaddirInternal, takes same opts object as main recursiveReaddir function
  async function recursiveReaddirInternalAsync(opts) {
    if (opts.logDir) {
      console.log(opts.filePath);
    }
    
    let subFiles;
    
    try {
      let contents = await fs.promises.readdir(opts.filePath, { withFileTypes: true });
      
      let [ folders, files ] = recursiveReaddirInternal_FilterSortDirents(opts, contents);
      
      subFiles = [
        ...(await Promise.all(
          folders.map(async x => {
            let result = await recursiveReaddirInternalAsync(recursiveReaddirInternal_GenerateSubOpts(opts, x));
            
            return recursiveReaddirInternal_FoldersPostProcess(opts, x, result);
          })
        ))
        .flat(),
        ...recursiveReaddirInternal_FilesPostProcess(opts, files),
      ];
    } catch (e) {
      let res = recursiveReaddirInternal_HandleError(opts, e);
      
      if (res != null) {
        return res;
      }
    }
    
    return recursiveReaddirInternal_FinalProcessing(opts, subFiles);
  }
  
  // Internal function
  function recursiveReaddirInternal_FilterSortDirents(opts, contents) {
    let currentExcludeDirs = opts.excludeDirs.filter(x => !x.includes('/'));
    
    contents = contents.filter(x => !currentExcludeDirs.includes(x.name));
    
    let folders = [], files = [];
    
    contents.forEach(x =>
      x.isDirectory() && !x.isSymbolicLink() ?
        folders.push(x) :
        files.push(x)
    );
    
    return [folders, files];
  }
  
  // Internal function
  function recursiveReaddirInternal_GenerateSubOpts(opts, x) {
    return {
      ...opts,
      filePath: opts.filePath + '/' + x.name,
      excludeDirs: opts.excludeDirs
        .filter(x => x.startsWith(x))
        .map(x => x.split('/').slice(1).join('/')),
      
      _ownFolderName: x.name,
    };
  }
  
  // Internal function
  function recursiveReaddirInternal_FoldersPostProcess(opts, x, result) {
    if (opts.includeFolders) {
      if (opts.withFileTypes) {
        result = result.map(([yPath, yDirent]) => [
          (x.name + '/' + yPath).replace(/\/\.$/, ''),
          yDirent
        ]);
      } else {
        result = result.map(y => (x.name + '/' + y).replace(/\/\.$/, ''));
      }
    } else {
      if (opts.withFileTypes) {
        result = result.map(([yPath, yDirent]) => [
          x.name + '/' + yPath,
          yDirent
        ]);
      } else {
        result = result.map(y => x.name + '/' + y);
      }
    }
    
    return result;
  }
  
  // Internal function
  function recursiveReaddirInternal_FilesPostProcess(opts, files) {
    return files.map(x => {
      if (opts.withFileTypes) {
        return [x.name, x];
      } else {
        return x.name;
      }
    });
  }
  
  // Internal function
  function recursiveReaddirInternal_HandleError(opts, e) {
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
  
  // Internal function
  function recursiveReaddirInternal_FinalProcessing(opts, subFiles) {
    if (opts.includeFolders) {
      return [
        opts.withFileTypes ? ['.', new fs.Dirent(opts._ownFolderName, fs.constants.UV_DIRENT_DIR)] : '.',
        ...subFiles,
      ];
    } else {
      return subFiles;
    }
  }
  
  return recursiveReaddir;
})();

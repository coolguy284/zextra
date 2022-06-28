// node local_sitemap_gen.js <rootFilePath> <baseURL> [initialPage]

var replaceIndexWSlash = false;

var fs = require('fs');
var path = require('path');

var crawler = {
  fsGetterFuncGen: function fsGetterFuncGen(rootPath) {
    return async filePath => {
      let fullPath = path.join(rootPath, new URL('http:/e/' + (filePath.startsWith('/') ? filePath.slice(1) : filePath)).pathname);
      if (path.sep == '\\') fullPath = fullPath.replaceAll('\\', '/');
      try {
        return await fs.promises.readFile(fullPath);
      } catch (e) {
        return undefined;
      }
    };
  },
  
  crawl: async function crawl(rootPath, getterFunc) {
    var paths = new Map([[rootPath, 0]]), newPaths = [[rootPath, await getterFunc(rootPath)]];
    
    for (var depth = 1; newPaths.length > 0 && depth < 10; depth++) {
      newPaths = (await Promise.all(
        newPaths.map(filePath => {
          let matched = filePath[1] ? filePath[1].toString().match(/(?<=<a.*href\s*=\s*(?:'|")).*?(?=(?:'|")>)/g) ?? [] : [];
          return matched.map(subFilePath => {
              subFilePath = subFilePath.endsWith('/') ? subFilePath + 'index.html' : subFilePath;
              return subFilePath.startsWith('/') ? subFilePath : path.join(filePath[0], '../' + subFilePath).split(path.sep).join(path.posix.sep);
            });
        })
        .reduce((a, c) => (c.forEach(x => a.push(x)), a), [])
        .filter(filePath => !paths.has(filePath))
        .map(async filePath => [filePath, await getterFunc(filePath)])
      ))
      .filter(filePath => filePath[1]);
      
      newPaths.forEach(filePath => paths.set(filePath[0], depth));
    }
    
    return paths;
  },
};

function performCrawl(rootFilePath, baseURL, initialPage) {
  if (rootFilePath == null) throw new Error('Site root must be specified');
  if (baseURL == null) throw new Error('Base URL must be specified');
  if (initialPage == null) initialPage = '/index.html';
  crawler.crawl(initialPage, crawler.fsGetterFuncGen(rootFilePath)).then(sites => {
    fs.writeFileSync(rootFilePath + '/sitemap.xml', 
    '<?xml version = \'1.0\' encoding = \'utf-8\'?>\n' +
    '<urlset xmlns = \'http://www.sitemaps.org/schemas/sitemap/0.9\'>\n' +
    Array.from(sites.entries()).map(site =>
      '  <url>\n' +
      `    <loc>${baseURL}${replaceIndexWSlash && site[0].endsWith('index.html') ? site[0].slice(0, -10) : site[0]}</loc>\n` +
      `    <lastmod>${fs.statSync(rootFilePath + site[0]).mtime.toISOString().slice(0, -1)}+00:00</lastmod>\n` +
      `    <changefreq>yearly</changefreq>\n` +
      `    <priority>${(1.0 - site[1] / 10).toFixed(1)}</priority>\n` +
      '  </url>'
    ).join('\n  \n') + '\n' +
    '</urlset>\n');
  });
}

if (process.argv.length == 2 || process.argv[2] == '--help') {
  console.log('arguments: node local_sitemap_gen.js <rootFilePath> <baseURL> [initialPage]');
} else {
  performCrawl(process.argv[2], process.argv[3].replace(/\/$/, ''), (process.argv[4] ?? '/index.html').replace(/^\/?/, '/'));
}

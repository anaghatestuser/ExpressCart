const { minify } = require('uglify-es');
const cleanCss = require('clean-css');
const globby = require('globby');
const colors = require('colors');
const { render } = require('less');
const fs = require('fs');
const path = require('path');

// The deploy task only ever reads from and writes to the asset directories
// below. Resolve them once so symlinks committed to the working tree cannot
// redirect the build outside of them (CWE-59/CWE-73).
const assetRoots = [path.resolve('public'), path.resolve('views')].map((directory) => {
    try{
        const realPath = fs.realpathSync(directory);
        // Refuse the directory itself when it is reached through a symlink
        if(realPath === directory && fs.statSync(realPath).isDirectory()){
            return realPath;
        }
    }catch(error){
        // Missing asset directories are ignored
    }
    return null;
}).filter(Boolean);

// True when resolving every symlink in filePath keeps it inside an asset root
const isContainedPath = (filePath) => {
    let absolutePath = path.resolve(filePath);
    // Output files may not exist yet, so resolve the deepest ancestor that does
    while(true){
        try{
            const realPath = fs.realpathSync(absolutePath);
            return assetRoots.some((root) => realPath === root || realPath.startsWith(`${root}${path.sep}`));
        }catch(error){
            const parentPath = path.dirname(absolutePath);
            if(parentPath === absolutePath){
                return false;
            }
            absolutePath = parentPath;
        }
    }
};

const writeFileSyncContained = (filePath, data) => {
    if(!isContainedPath(filePath)){
        console.log(colors.red(`Skipping write outside the asset directories: ${filePath}`));
        return;
    }
    try{
        // Never write through a symlink staged at an output path
        if(fs.lstatSync(filePath).isSymbolicLink()){
            fs.unlinkSync(filePath);
        }
    }catch(error){
        // The destination does not exist yet, nothing to replace
    }
    fs.writeFileSync(filePath, data);
};

const compressJS = async () => {
    const publicFiles = globby.sync([
        'public/javascripts/*.js',
        '!public/javascripts/*.min.js'
    ], { nosort: true, followSymbolicLinks: false }).filter(isContainedPath);

    // Public JS
    publicFiles.forEach(async(file) => {
        const minified = await minify(fs.readFileSync(file, 'utf-8'));
        const parseFilePath = path.parse(file);
        writeFileSyncContained(`${parseFilePath.dir}/${parseFilePath.name}.min.js`, minified.code);
    });

    const themeFiles = globby.sync([
        'views/themes/**/*.js',
        '!views/themes/**/*.min.js'
    ], { nosort: true, followSymbolicLinks: false }).filter(isContainedPath);

    // Theme JS
    themeFiles.forEach(async(file) => {
        const minified = await minify(fs.readFileSync(file, 'utf-8'));
        const parseFilePath = path.parse(file);
        writeFileSyncContained(`${parseFilePath.dir}/${parseFilePath.name}.min.js`, minified.code);
    });
};

const compressCss = async () => {
    const publicOutputPath = path.join('public', 'stylesheets');
    const themeOutputPath = path.join('views', 'themes');
    const publicFiles = globby.sync([
        'public/stylesheets/less/*.less'
    ], { nosort: true, followSymbolicLinks: false }).filter(isContainedPath);

    publicFiles.forEach(async(file) => {
        const parseFilePath = path.parse(file);
        // Process the less
        const less = await render(fs.readFileSync(file, 'utf-8'), {});

        // Write less style
        writeFileSyncContained(`${publicOutputPath}/${parseFilePath.name}.css`, less.css);

        // Minify css
        const minified = await new cleanCss({}).minify(less.css).styles;

        // Write minified css
        writeFileSyncContained(`${publicOutputPath}/${parseFilePath.name}.min.css`, minified);
    });

    const themeFiles = globby.sync([
        'views/themes/*.less'
    ], { nosort: true, followSymbolicLinks: false }).filter(isContainedPath);
    themeFiles.forEach(async(file) => {
        const parseFilePath = path.parse(file);
        // Process the less
        const less = await render(fs.readFileSync(file, 'utf-8'), {});

        // Write less style
        writeFileSyncContained(`${themeOutputPath}/${parseFilePath.name}.css`, less.css);

        // Minify css
        const minified = await new cleanCss({}).minify(less.css).styles;

        // Write minified css
        writeFileSyncContained(`${themeOutputPath}/${parseFilePath.name}.min.css`, minified);
    });
};

const run = async () => {
    await compressJS();
    await compressCss();
    console.log(colors.green('Complete!'));
};

// Run the deploy tasks
run();

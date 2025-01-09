"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resaveAllBundleDependencies = void 0;
const path_1 = __importDefault(require("path"));
const fs = __importStar(require("fs"));
const settingsFileReg = /^settings\.(\w+\.)?json$/g;
const jsRegisterReg = /^\s*System.register\(\s*[\"\'](.*?)[\"\']\s*,\s*\[\s*(.*?)\]\s*,/;
const jsChunkNameReg = /^chunks:\/\/\/_virtual\/(.*)$/;
const ignoreJsDepends = ['cc', 'cc/env', './rollupPluginModLoBabelHelpers.js'];
function findSettingFile(srcPath) {
    const files = fs.readdirSync(srcPath);
    for (const file of files) {
        if (settingsFileReg.test(file))
            return path_1.default.join(srcPath, file);
    }
    throw new Error("Cannot find settings.json in dir:" + srcPath);
}
function traverseDirectoryRecursive(dir, callback) {
    fs.readdirSync(dir).forEach((file) => {
        const filePath = path_1.default.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            callback(filePath, file);
            traverseDirectoryRecursive(filePath, callback); // 递归调用
        }
    });
}
function extendDeepDenps(self, set, deps, allDeps) {
    for (const dep of deps) {
        if (self === dep)
            return true;
        set.add(dep);
        if (!allDeps.has(dep))
            continue;
        if (extendDeepDenps(self, set, allDeps.get(dep), allDeps)) {
            return true;
        }
    }
    return false;
}
function extendAndCheckCircleDependent(allBundels, deps) {
    for (const name of allBundels) {
        if (!deps.has(name))
            continue;
        let set = new Set();
        if (extendDeepDenps(name, set, deps.get(name), deps)) {
            return true;
        }
        deps.set(name, set);
    }
    return false;
}
function resaveAllBundleDependencies(dstPath, scriptMoved) {
    const file = findSettingFile(path_1.default.join(dstPath, 'src'));
    const settings = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const allBundles = settings.assets.projectBundles;
    const remoteBundles = settings.assets.remoteBundles;
    const bundleVers = settings.assets.bundleVers;
    const subpackages = settings.assets.subpackages;
    const md5Bundles = Object.keys(bundleVers);
    let deps = new Map();
    let jsBundles = new Map();
    let bundleImports = new Map();
    for (const name of allBundles) {
        const bundleVersion = md5Bundles.indexOf(name) !== -1 ? bundleVers[name] : undefined;
        const isRemote = remoteBundles.indexOf(name) !== -1;
        const isSubpackage = subpackages.indexOf(name) !== -1;
        const jsonFile = path_1.default.join(dstPath, isRemote ? (isSubpackage ? 'subpackages' : 'remote') : 'assets', name, bundleVersion ? `config.${bundleVersion}.json` : 'config.json');
        const config = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
        deps.set(name, new Set(config.deps));
        const jsFile = path_1.default.join(dstPath, isRemote ? (isSubpackage ? 'subpackages' : (scriptMoved ? 'src/bundle-scripts' : 'remote')) : 'assets', name, isSubpackage ? 'game.js' : (bundleVersion ? `index.${bundleVersion}.js` : 'index.js'));
        const lines = fs.readFileSync(jsFile, 'utf-8').split(/\r?\n/);
        let allImports = new Set();
        for (const line of lines) {
            const match = line.match(jsRegisterReg);
            if (!match)
                continue;
            const chunkName = match[1];
            const imports = match[2];
            const chunkMatch = chunkName.match(jsChunkNameReg);
            if (!chunkMatch) {
                throw new Error(`Unknow register name with ${chunkName} in file ${jsFile}`);
            }
            const fileName = chunkMatch[1];
            if (fileName != name) {
                jsBundles.set('./' + fileName, name);
            }
            for (const str of imports.split(',')) {
                const dep = eval(str);
                if (dep && ignoreJsDepends.indexOf(dep) === -1) {
                    allImports.add(dep);
                }
            }
        }
        bundleImports.set(name, allImports);
    }
    // 查找所有bundle的meta文件以添加扩展仍赖
    traverseDirectoryRecursive(Editor.Project.path, (dir, name) => {
        var _a;
        const mataPath = dir + ".meta";
        if (!fs.existsSync(mataPath))
            return;
        const meta = JSON.parse(fs.readFileSync(mataPath, 'utf-8'));
        const userData = meta['userData'];
        if (!userData || !userData['isBundle'])
            return;
        const bundleName = (_a = userData['bundleName']) !== null && _a !== void 0 ? _a : name;
        if (allBundles.indexOf(bundleName) === -1)
            return;
        const exts = userData['dep_ext'];
        if (!exts)
            return;
        for (const n of exts.split(',')) {
            const fixName = n.trim();
            if (fixName.length != 0) {
                if (!deps.has(name)) {
                    deps.set(name, new Set());
                }
                deps.get(name).add(fixName);
            }
        }
    });
    for (const name of allBundles) {
        if (!bundleImports.has(name))
            continue;
        for (const js of bundleImports.get(name)) {
            if (!jsBundles.has(js)) {
                console.error(`Cannot find which bundle is script:${js} in!`);
                continue;
            }
            const bundle = jsBundles.get(js);
            if (bundle == name)
                continue;
            if (!deps.has(name)) {
                deps.set(name, new Set());
            }
            deps.get(name).add(bundle);
        }
    }
    // 递归查找所有依赖并检查是否循环依赖
    const hasCircle = extendAndCheckCircleDependent(allBundles, deps);
    let data = {};
    for (const kv of deps) {
        const set = kv[1];
        if (set && set.size > 0) {
            let list = [];
            for (const d of set) {
                list.push(d);
            }
            list.sort((a, b) => {
                if (!deps.has(a))
                    return -1;
                if (!deps.has(b))
                    return 1;
                if (deps.get(b).has(a))
                    return -1;
                if (deps.get(a).has(b))
                    return 1;
                return 0;
            });
            data[kv[0]] = list;
        }
    }
    if (hasCircle) {
        throw new Error('存在循环依赖，请检查依赖关系！' + JSON.stringify(data));
    }
    settings.assets['dependencies'] = data;
    fs.writeFileSync(file, JSON.stringify(settings));
}
exports.resaveAllBundleDependencies = resaveAllBundleDependencies;

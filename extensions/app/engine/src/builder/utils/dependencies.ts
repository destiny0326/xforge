import path from "path";
import * as fs from 'fs';
import { IBundleConfig, IOutputSettings, Platform } from "../../../@types/packages/builder/@types";

const settingsFileReg = /^settings\.(\w+\.)?json$/g;
const jsRegisterReg = /^\s*System.register\(\s*[\"\'](.*?)[\"\']\s*,\s*\[\s*(.*?)\]\s*,/;
const jsChunkNameReg = /^chunks:\/\/\/_virtual\/(.*)$/;
const ignoreJsDepends = ['cc', 'cc/env', './rollupPluginModLoBabelHelpers.js'];

function deleteDirIfExist(dir: string): void {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`removed dir: ${dir} as it's not been depended`)
    }
}

function excludeBundle(name: string, settings: IOutputSettings, dir: string): void {
    let projectBundles = settings.assets.projectBundles;
    projectBundles.splice(projectBundles.indexOf(name), 1);
    let remotes = settings.assets.remoteBundles;
    if (remotes.indexOf(name) !== -1) {
        remotes.splice(remotes.indexOf(name), 1);
        deleteDirIfExist(path.join(dir, "remote", name));
        deleteDirIfExist(path.join(dir, "src", "bundle-scripts", name));
    }
    let subpackages = settings.assets.subpackages;
    if (subpackages.indexOf(name) !== -1) {
        subpackages.splice(subpackages.indexOf(name), 1);
        deleteDirIfExist(path.join(dir, "subpackages", name));
    }
    deleteDirIfExist(path.join(dir, "assets", name));
    if (settings.assets.bundleVers[name]) {
        delete settings.assets.bundleVers[name];
    }
}

function findSettingFile(srcPath: string): string {
    const files = fs.readdirSync(srcPath);
    for (const file of files) {
        if (settingsFileReg.test(file))
            return path.join(srcPath, file);
    }

    throw new Error("Cannot find settings.json in dir:" + srcPath);
}

function traverseDirectoryRecursive(dir: string, callback:(dir:string, name: string)=>void):void {
    fs.readdirSync(dir).forEach((file) => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            callback(filePath, file);
            traverseDirectoryRecursive(filePath, callback); // 递归调用
        }
    });
}

function extendDeepDenps(self: string, set: Set<string>, deps: Set<string>, allDeps: Map<string, Set<string>>): boolean {
    for (const dep of deps) {
        if (self === dep)
            return true;
        set.add(dep);
        if (!allDeps.has(dep)) continue;
        if (extendDeepDenps(self, set, allDeps.get(dep), allDeps)) {
            return true;
        }
    }

    return false;
}

function extendAndCheckCircleDependent(allBundels: string[], deps: Map<string, Set<string>>): boolean {
    for (const name of allBundels) {
        if (!deps.has(name)) continue;
        let set = new Set<string>();
        if (extendDeepDenps(name, set, deps.get(name), deps)) {
            return true;
        }
        deps.set(name, set);
    }

    return false;
}

export function resaveAllBundleDependencies(dstPath:string, scriptMoved: boolean): void {
    const file = findSettingFile(path.join(dstPath, 'src'));
    const settings: IOutputSettings = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const allBundles = settings.assets.projectBundles;
    const remoteBundles = settings.assets.remoteBundles;
    const bundleVers = settings.assets.bundleVers;
    const subpackages = settings.assets.subpackages;
    const md5Bundles = Object.keys(bundleVers);
    let deps: Map<string, Set<string>> = new Map();
    let jsBundles: Map<string, string> = new Map();
    let bundleImports: Map<string, Set<string>> = new Map();
    let autoExcludeBundles: string[] = [];
    for (const name of allBundles) {
        const bundleVersion = md5Bundles.indexOf(name) !== -1 ? bundleVers[name]: undefined;
        const isRemote = remoteBundles.indexOf(name) !== -1;
        const isSubpackage = subpackages.indexOf(name) !== -1;
        const jsonFile = path.join(dstPath
            , isSubpackage ? 'subpackages' : (isRemote ? 'remote' : 'assets')
            , name
            , bundleVersion ? `config.${bundleVersion}.json` : 'config.json'
        );
        const config: IBundleConfig = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
        deps.set(name, new Set(config.deps));

        const jsFile = path.join(dstPath
            , isSubpackage ? 'subpackages' : (isRemote ? (scriptMoved ? 'src/bundle-scripts' : 'remote') : 'assets')
            , name
            , isSubpackage ? 'game.js' : (bundleVersion ? `index.${bundleVersion}.js` : 'index.js')
        );
        const lines = fs.readFileSync(jsFile, 'utf-8').split(/\r?\n/);
        let allImports = new Set<string>();
        for (const line of lines) {
            const match = line.match(jsRegisterReg);
            if (!match) continue;
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
    traverseDirectoryRecursive(Editor.Project.path, (dir: string, name: string)=>{
        const mataPath = dir + ".meta";
        if (!fs.existsSync(mataPath)) return;
        const meta = JSON.parse(fs.readFileSync(mataPath, 'utf-8'));
        const userData = meta['userData']
        if (!userData || !userData['isBundle']) return;
        const bundleName = userData['bundleName'] ?? name;
        if (allBundles.indexOf(bundleName) === -1) return;
        if (userData['auto_exclude']) {
            autoExcludeBundles.push(bundleName);
        }
        const exts: string = userData['dep_ext'];
        if (!exts) return;
        for (const n of exts.split(',')) {
            const fixName = n.trim();
            if (fixName.length != 0) {
                if (!deps.has(name)) {
                    deps.set(name, new Set<string>());
                }
                deps.get(name).add(fixName);
            }
        }
    });
    
    for (const name of allBundles) {
        if (!bundleImports.has(name)) continue;
        for (const js of bundleImports.get(name)) {
            if (!jsBundles.has(js)) {
                console.error(`Cannot find which bundle is script:${js} in!`);
                continue;
            }
            const bundle = jsBundles.get(js);
            if (bundle == name) continue;
            if (!deps.has(name)) {
                deps.set(name, new Set<string>());
            }
            deps.get(name).add(bundle);
        }
    }

    // 递归查找所有依赖并检查是否循环依赖
    const hasCircle = extendAndCheckCircleDependent(allBundles, deps);

    let data: any = {};
    for (const kv of deps) {
        const set = kv[1];
        if (set && set.size > 0) {
            let list = [];
            for (const d of set) {
                list.push(d);
            }

            list.sort((a: string, b: string)=>{
                if (!deps.has(a)) return -1;
                if (!deps.has(b)) return 1;
                if (deps.get(b).has(a)) return -1;
                if (deps.get(a).has(b)) return 1;
                return 0;
            })

            data[kv[0]] = list;
        }
    }

    if (hasCircle) {
        throw new Error('存在循环依赖，请检查依赖关系！' + JSON.stringify(data));
    }

    settings.assets['dependencies'] = data;

    // 排除所有未被依赖且自动排除的Bundle
    for (const name of autoExcludeBundles) {
        let isDep = false;
        for (const set of deps.values()) {
            if (set.has(name)) {
                isDep = true;
                break;
            }
        }
        if (!isDep) {
            excludeBundle(name, settings, dstPath);
        }
    }
    
    fs.writeFileSync(file, JSON.stringify(settings));
}
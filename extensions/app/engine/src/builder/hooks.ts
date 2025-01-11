import path from 'path';
import { BuildHook } from '../../@types/packages/builder/@types';
import { adaptFileMD5 } from './utils/file';
import { resaveAllBundleDependencies } from './utils/dependencies';

export const throwError = true;

export const onAfterBuild: BuildHook.onAfterBuild = async function (options, result) {
    // 管理Bundle间的依赖关系，确保Bundle中脚本加载顺序
    resaveAllBundleDependencies(result.dest, options.moveRemoteBundleScript || options.platform == 'wechatgame');

    if (options.platform !== 'web-mobile' && options.platform !== 'web-desktop') {
        return;
    }

    if (!options.md5Cache) {
        return;
    }

    adaptFileMD5(path.join(result.dest, 'index.html'));
};
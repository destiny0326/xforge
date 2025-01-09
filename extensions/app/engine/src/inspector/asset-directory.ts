'use strict';

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface Asset {
    displayName: string;
    file: string;
    imported: boolean;
    importer: string;
    invalid: boolean;
    isDirectory: boolean;
    library: {
        [extname: string]: string;
    };
    name: string;
    url: string;
    uuid: string;
    visible: boolean;
    subAssets: {
        [id: string]: Asset;
    };
}

interface Meta {
    files: string[];
    imported: boolean;
    importer: string;
    subMetas: {
        [id: string]: Meta;
    };
    userData: {
        [key: string]: any;
    };
    uuid: string;
    ver: string;
}

type Selector<$> = { $: Record<keyof $, HTMLElement> } & { dispatch(str: string): void, assetList: Asset[], metaList: Meta[] };

export const $ = {
    'code': '#code',
    'section': '#section',
    'deps': '#deps',
    'depsInput': '#depsInput',
};

// 添加bundle的自定义依赖，不知道怎么使用list引用 Assets，先用input代替
export const template = `
<ui-section id="deps" header="依赖Bundle扩展" expand>
    <!--ui-button @click="addDependency">添加资源</ui-button-->
    <!--ui-list id="list" v-for="(dep, index) in extDepList" :key="index">
        <ui-item>{{ dep }}</ui-item>
        <ui-button @click="removeDependency(index)">删除</ui-button>
    </ui-list-->
    <ui-input id="depsInput" tooltip="有多个依赖包时使用逗号隔开"></ui-input>
</ui-section>
<ui-section id="section" header="文件夹说明" expand>
    <ui-code id="code"></ui-code>
</ui-section>
`;

type PanelThis = Selector<typeof $> & { currentMeta?: Meta, currentUrl:string };

export function update(this: PanelThis, assetList: Asset[], metaList: Meta[]) {
    this.assetList = assetList;
    this.metaList = metaList;

    if (assetList.length === 0) {
        this.$.code.innerHTML = '';
    } else {
        this.$.code.innerHTML = assetList
            .filter((asset) => {
                const mdFile = join(asset.file, `.${asset.name}.md`);
                return existsSync(mdFile);
            })
            .map((asset) => {
                const mdFile = join(asset.file, `.${asset.name}.md`);
                const mdStr = readFileSync(mdFile, 'utf-8');
                return assetList.length > 1 ? `${asset.url}:\n ${mdStr}` : mdStr;
            })
            .join('\n') || '';
    }

    if (this.$.code.innerHTML === '') {
        this.$.section.hidden = true;
    } else {
        this.$.section.hidden = false;
    }

    // 添加bundle的自定义依赖
    this.currentMeta = null;
    this.currentUrl = null;
    const input = this.$.depsInput as any;
    if (assetList.length === 1) { // 不支持multiple
        let meta = metaList[0];
        if (meta.userData['isBundle']) {
            this.$.deps.hidden = false;
            input.value = meta.userData['dep_ext'] ?? ""
            this.currentUrl = assetList[0].url;
            this.currentMeta = meta;
        } else {
            input.value = ''
            this.$.deps.hidden = true;
        }
    } else {
        input.value = ''
        this.$.deps.hidden = true;
    }
}

export function ready(this: PanelThis) {
    // TODO something
    this.$.depsInput.addEventListener('confirm', ()=>{
        if (!this.currentMeta) return;
        const input = this.$.depsInput as any;
        this.currentMeta.userData['dep_ext'] = input.value;
    })
}

export function close(this: PanelThis,) {
    // TODO something
}
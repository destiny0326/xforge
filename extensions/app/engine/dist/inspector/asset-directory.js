'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.close = exports.ready = exports.update = exports.template = exports.$ = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
exports.$ = {
    'code': '#code',
    'section': '#section',
    'deps': '#deps',
    'depsInput': '#depsInput',
    'autoExclude': '#autoExclude',
};
// 添加bundle的自定义依赖，不知道怎么使用list引用 Assets，先用input代替
exports.template = `
<ui-section id="deps" header="Bundle依赖扩展" expand>
    <ui-prop>
        <ui-label slot="label" tooltips="选中时，若无外部Bundle依赖该Bundle，则自动排除">是否自动排除</ui-label>
        <ui-checkbox slot="content" id="autoExclude"></ui-checkbox>
    </ui-prop>
    <!--ui-button @click="addDependency">添加资源</ui-button-->
    <!--ui-list id="list" v-for="(dep, index) in extDepList" :key="index">
        <ui-item>{{ dep }}</ui-item>
        <ui-button @click="removeDependency(index)">删除</ui-button>
    </ui-list-->
    <ui-label>输入额外依赖的Assets Bundle</ui-label>
    <ui-input id="depsInput" tooltip="有多个依赖包时使用逗号隔开"></ui-input>
</ui-section>
<ui-section id="section" header="文件夹说明" expand>
    <ui-code id="code"></ui-code>
</ui-section>
`;
function update(assetList, metaList) {
    var _a, _b;
    this.assetList = assetList;
    this.metaList = metaList;
    if (assetList.length === 0) {
        this.$.code.innerHTML = '';
    }
    else {
        this.$.code.innerHTML = assetList
            .filter((asset) => {
            const mdFile = path_1.join(asset.file, `.${asset.name}.md`);
            return fs_1.existsSync(mdFile);
        })
            .map((asset) => {
            const mdFile = path_1.join(asset.file, `.${asset.name}.md`);
            const mdStr = fs_1.readFileSync(mdFile, 'utf-8');
            return assetList.length > 1 ? `${asset.url}:\n ${mdStr}` : mdStr;
        })
            .join('\n') || '';
    }
    if (this.$.code.innerHTML === '') {
        this.$.section.hidden = true;
    }
    else {
        this.$.section.hidden = false;
    }
    // 添加bundle的自定义依赖
    this.currentMeta = null;
    this.currentUrl = null;
    const input = this.$.depsInput;
    if (assetList.length === 1) { // 不支持multiple
        let meta = metaList[0];
        if (meta.userData['isBundle']) {
            this.$.deps.hidden = false;
            input.value = (_a = meta.userData['dep_ext']) !== null && _a !== void 0 ? _a : "";
            this.currentUrl = assetList[0].url;
            this.currentMeta = meta;
            const checkBox = this.$.autoExclude;
            checkBox.value = (_b = meta.userData['auto_exclude']) !== null && _b !== void 0 ? _b : false;
        }
        else {
            input.value = '';
            this.$.deps.hidden = true;
        }
    }
    else {
        input.value = '';
        this.$.deps.hidden = true;
    }
}
exports.update = update;
function ready() {
    // TODO something
    this.$.depsInput.addEventListener('confirm', () => {
        if (!this.currentMeta)
            return;
        const input = this.$.depsInput;
        this.currentMeta.userData['dep_ext'] = input.value;
    });
    this.$.autoExclude.addEventListener('confirm', () => {
        if (!this.currentMeta)
            return;
        this.currentMeta.userData['auto_exclude'] = !this.currentMeta.userData['auto_exclude'] ? true : undefined;
    });
}
exports.ready = ready;
function close() {
    // TODO something
}
exports.close = close;

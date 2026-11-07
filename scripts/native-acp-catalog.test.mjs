import assert from 'node:assert/strict';import {capabilities,launchBinding} from './native-acp-catalog.mjs';
assert.deepEqual(capabilities({configOptions:[{category:'model',options:[{value:'k',name:'Kimi'}]},{category:'thought_level',options:[{value:'high',name:'High'}]}]}),[{id:'k',name:'Kimi',efforts:[{id:'high',name:'High'}]}]);
assert.deepEqual(capabilities({models:{availableModels:[{modelId:'codex',name:'Codex'}]},configOptions:[]}),[{id:'codex',name:'Codex',efforts:[]}]);
assert.notEqual(launchBinding([{id:'kimi',program:'one',args:[]}]),launchBinding([{id:'kimi',program:'two',args:[]}]));
assert.notEqual(launchBinding([{id:'kimi',program:'one',args:[]}]),launchBinding([{id:'zai',program:'one',args:[]}]));
assert.deepEqual(capabilities({}),[]);
console.log('Direct ACP capability normalization and launch binding: PASS');

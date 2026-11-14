import path from 'node:path';

const within=(value,parent)=>{const relative=path.relative(parent,value);return relative===''||!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};

// Run before creating any fixture keys or starting a server. A private mode
// does not stop a same-user static server from reading files under its root.
export function privateRehearsalPath(value,repository,{allowProjectArtifacts=true}={}){
 if(typeof value!=='string'||!path.isAbsolute(value)||typeof repository!=='string'||!path.isAbsolute(repository))throw Error('Choose an absolute dedicated private rehearsal directory.');
 const target=path.resolve(value),root=path.resolve(repository);
 if(target===path.parse(target).root)throw Error('Choose a dedicated private rehearsal directory.');
 if(within(target,root)&&(!allowProjectArtifacts||!within(target,path.join(root,'.artifacts'))))throw Error('Private rehearsal data must stay outside the served project; only its explicitly denied .artifacts directory is supported.');
 return target;
}

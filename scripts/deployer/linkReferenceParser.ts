import * as fs from 'fs'
import * as path from 'path'

export async function retrieveFiles(directory, excludes = null, includes = null) {
    async function _retrieveFiles(directory, results, excludesReg, includesReg) {
        let currentFiles = await fs.readdirSync(directory)
        currentFiles.forEach(file => {
            const state = fs.statSync(path.join(directory, file));
            const fullPath = directory + '/' + file
            if (state.isDirectory()) {
                _retrieveFiles(fullPath, results, excludesReg, includesReg)
            } else {
                if (excludesReg != null && excludesReg.test(fullPath)) {
                    return;
                }
                if (includesReg != null && !includesReg.test(fullPath)) {
                    return;
                }
                results.push(fullPath)
            }
        })
    }

    let files = []
    let excludesReg = excludes != null ? new RegExp(excludes) : null;
    let includesReg = includes != null ? new RegExp(includes) : null;
    await _retrieveFiles(directory, files, excludesReg, includesReg)
    return files
}

export async function parseLinkedLibraries(filePaths) {
    let result = {}
    for (let i = 0; i < filePaths.length; i++) {
        try {
            const rawContent = fs.readFileSync(filePaths[i], 'utf-8')
            const jsonContent = JSON.parse(rawContent);
            const contractName = jsonContent.contractName;
            const linkReferences = jsonContent.linkReferences;
            let referencesContractNames = []
            for (let referencePath in linkReferences) {
                for (let contractName in linkReferences[referencePath]) {
                    referencesContractNames.push(contractName)
                }
            }
            if (referencesContractNames.length > 0) {
                result[contractName] = referencesContractNames
            }
        } catch (err) {
            console.log("Warning while parsing linke libraries:", err)
        }
    }
    return result;
}

export async function retrieveLinkReferences(artifactDirectory) {
    const filePaths = await retrieveFiles(artifactDirectory, "Test|test|dbg", "")
    const references = await parseLinkedLibraries(filePaths)
    return references
}


// retrieveLinkReferences("./artifacts/contracts").then(console.log)

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const os = require('os');
const { execSync } = require('child_process')
const chalk = require('chalk');
require('dotenv').config()

// Get the path to the mod folder from the first command line argument
let modFolderPath = process.argv[2];

let gameFileVersion = null;
let theGame = null;

function isWindows() {
    return os.platform() === 'win32';
}


function isWSL() {
    return process.env.WSL_DISTRO_NAME !== undefined;
}

const getWindowsDocumentsPath = () => {
    if(!isWSL() && isWindows()){
      return os.homedir() + ' /Documents';
    }else if(!isWSL() && !isWindows()){
      throw new Error("Wrong OS.");    
    }

    const windowsUsername = execSync('cmd.exe /c "echo %USERNAME%"', { encoding: 'utf8' }).trim();
    return `/mnt/c/Users/${windowsUsername}/Documents`;
};

const extractModFile = (filePath, gameVersion) => {
  const moduleFileContent = fs.readFileSync(filePath, 'utf-8');
  const modVersion = moduleFileContent.match(/supported_version="(.*)"/)?.[1];
  const modName = moduleFileContent.match(/name="(.*)"/)?.[1];
  const isOutDated = typeof modVersion === 'string' && modVersion !== gameVersion;

  return {
    moduleFileContent,
    modVersion,
    modName,
    isOutDated
  }
}

function findModFiles(directory) {
    const files = fs.readdirSync(directory);
    const modFiles = files.filter(file => path.extname(file) === '.mod');
    return modFiles.map(file => path.join(directory, file));
}

const replaceVersion = (filePath, oldVersion, newVersion) => {
  const documentsModuleContent = fs.readFileSync(filePath, 'utf-8');
  fs.writeFileSync(filePath, documentsModuleContent.replace(`supported_version="${oldVersion}"`, `supported_version="${newVersion}"`));
}

async function main(){  

  if(!modFolderPath){
    if(!fs.existsSync('.env')){
      console.error('You need to save your path to HOI4 steam install dir in .env file. Use HOI4_PATH={PATH} format.');
      console.log('or provide the path in script argument: `node hoi4-upversion.js PATH`');
      return;
    }

    modFolderPath = process.env.HOI4_PATH;
  }


  const gameDir = path.join(path.resolve(modFolderPath, '..', '..', '..'), 'common');
  const games = fs.readdirSync(gameDir, 'utf-8');


  // Loop through each steam app file and check for HOI4
  games.forEach((game) => {
    const steamapiPath = `${gameDir}/${game}/steam_appid.txt`;

    if(!fs.existsSync(steamapiPath)){
      return;
    }  

    if(fs.readFileSync(steamapiPath, 'utf-8') === path.basename(modFolderPath)){
      theGame = path.basename(modFolderPath);
      const launcherJsonPath = `${gameDir}/${game}/launcher-settings.json`;    

      if(fs.existsSync(launcherJsonPath)){
        const launcherJSON = JSON.parse(fs.readFileSync(launcherJsonPath));
        gameFileVersion = launcherJSON.version.match(/v(\d+\.\d+\.\d+)/)?.[1] || "Version not found";
      }
    }  
  });


  if(!theGame){
    console.error('No game detected.');
    return;
  }

  console.log(`Mod dir path is: ${chalk.green(modFolderPath)} and steam ID is ${chalk.red(theGame)}.\n Current game version is: ${chalk.yellow(gameFileVersion)}`);

  const modFileName = 'descriptor.mod';

  const documentsPath = path.join(getWindowsDocumentsPath(), 'Paradox Interactive', 'Hearts of Iron IV', 'mod');

  // Find all the .mod files in the mod folder and its subdirectories using glob.sync()
  const mods = fs.readdirSync(documentsPath, 'utf-8');


  let foundOutdated = false;

  // Loop through each .mod file and check if it's outdated
  mods.forEach((modDescriptorFileName) => {    
    const modDocFilePath = `${documentsPath}/${modDescriptorFileName}`;

    const modId = modDescriptorFileName.replace(['upc_', '.mod'], ['', '']);

    const documentsModuleContent = fs.readFileSync(modDocFilePath, 'utf-8');
    const docModVersion = documentsModuleContent.match(/supported_version="(.*)"/)?.[1];
    const docModName = documentsModuleContent.match(/name="(.*)"/)?.[1];
    const isOutDatedDoc = typeof docModVersion === 'string' && docModVersion !== gameFileVersion;

    if(isOutDatedDoc){
      foundOutdated = true;
      console.log(chalk.yellow(`[User doc] Mod ${docModName} is outdated (${chalk.red(docModVersion)}). Fixing...`));   
      replaceVersion(modDocFilePath, docModVersion, gameFileVersion);
    }
  });


  const steamMods = fs.readdirSync(modFolderPath, 'utf-8');



  steamMods.forEach((modDir) => {     
   const modConfigFiles = findModFiles(`${modFolderPath}/${modDir}`);


   modConfigFiles.forEach((modDescriptorFileName) => {
    let modDocFilePath = modDescriptorFileName;

    const {modVersion, isOutDated, modName} = extractModFile(modDocFilePath, gameFileVersion);  

    if(isOutDated){
      foundOutdated = true;
      console.log(chalk.yellow(`[Steam doc] Mod ${modName} is outdated (${chalk.red(modVersion)}). Fixing...`));   
      replaceVersion(modDocFilePath, modVersion, gameFileVersion);
    }
   });
  });

  if(!foundOutdated){
      console.log(chalk.yellow('No outdated mods were detected.'));
  }

  return;
}

main().then(() => {
  console.log(chalk.green('Done!'));
});
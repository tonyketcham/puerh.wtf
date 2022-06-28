const path = require('path');
const { readdir, readFile } = require('fs/promises');

// Path of the content folder
const contentPath = '../../content';

// Content containers
const origin = {
  directoryPath: path.join(contentPath, 'tastings'),
};

const destination = {
  directoryPath: path.join(contentPath, 'teas'),
};

readDir(origin.directoryPath).then(({ files, error }) => {
  error && console.error(error);
  origin.files = files;
  console.log(origin);
  origin.files.map((fileName) => {
    loadFile(origin.directoryPath, fileName);
  });
});

/**
 * Reads a directory & outputs file list.
 * @param {String} path directory
 * @returns {Object} an array of files found and an error, if one exists
 */
async function readDir(path) {
  let files, error;

  try {
    files = await readdir(path);
  } catch (err) {
    error = err;
  }

  return { files, error };
}

/**
 * Reads a directory & outputs file list.
 * @param {String} directory directory
 * @param {String} fileName file name
 * @returns {Object} file contents and an error, if one exists
 */
async function loadFile(directory, fileName) {
  let data, error;

  try {
    data = await readFile(path.join(directory, fileName), 'utf8');
    console.log(data);
  } catch (err) {
    error = err;
  }

  return { data, error };
}

function frontmatter(text){
    return text.match(/---/)
}
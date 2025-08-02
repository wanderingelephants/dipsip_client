const fs = require('fs');
const path = require('path');
const { DateTime } = require('luxon');

function cleanOldAccessTokenFiles() {
  const dirPath = path.join(process.env.DATA_ROOT_FOLDER, 'kite_access_token');
  const todayStr = DateTime.now().toFormat('yyyy-LL-dd');

  if (!fs.existsSync(dirPath)) {
    console.log(`Directory does not exist: ${dirPath}`);
    return;
  }

  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const match = file.match(/^access_token_(\d{4}-\d{2}-\d{2})\.json$/);
    if (match) {
      const fileDateStr = match[1];
      if (fileDateStr !== todayStr) {
        const filePath = path.join(dirPath, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Deleted old token file: ${file}`);
        } catch (err) {
          console.error(`❌ Error deleting file ${file}:`, err);
        }
      }
    }
  }
}

module.exports = {
  cleanOldAccessTokenFiles
};

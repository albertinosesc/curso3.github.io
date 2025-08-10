function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Acompanhamento Musical');
}

var SPREADSHEET_ID = '1HBJJOWoofEflSZsQizgdTcT_mds2z-UhExAyxoFY8R0';

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function listarGuias() {
  const ss = getSpreadsheet_();
  return ss.getSheets().map(sheet => sheet.getName());
}

function criarGuia(nome) {
  const ss = getSpreadsheet_();
  ss.insertSheet(nome);
}

function renomearGuia(nomeAntigo, nomeNovo) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(nomeAntigo);
  if (sheet) sheet.setName(nomeNovo);
}

function deletarGuia(nome) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(nome);
  if (sheet) ss.deleteSheet(sheet);
}

function enviarDados(dados, nomeGuia) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(nomeGuia);
  if (!sheet) sheet = ss.insertSheet(nomeGuia);
  sheet.clear();
  if (dados && dados.length > 0) {
    sheet.getRange(1, 1, dados.length, dados[0].length).setValues(dados);
  }
}

function importarDados(nomeGuia) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(nomeGuia);
  if (!sheet) return [];
  return sheet.getDataRange().getValues();
}
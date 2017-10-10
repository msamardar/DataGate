function AddNotesFromSpec() {
  var SpecSheetId = "1VDMuENl__RDOfEmassOkBHUUFXFQ8o-poD1nx92hRnw"
  var sheet = SpreadsheetApp.openById(SpecSheetId);
  var letter = 'A'
  var lastRow = sheet.getLastRow();
  var NonMatchingSpec = [];
  setBackgroundWhite();
  for(var i=2; i<= lastRow; i++){
     try {
       var targetCellAddress = letter+'1';
       var headingCell = letter+i;
       var descriptionCell = 'E'+i;
       var descriptionText = sheet.getRange(descriptionCell).getValue();
       var exampleCell = 'F'+i;
       var exampleText = sheet.getRange(exampleCell).getValue();
       var NotesText = "";
       if(descriptionText != "" && exampleText != "")
       {
         NotesText = 'Description : '+descriptionText+ ' . Example : ' + exampleText;
       }
       else if(descriptionText == "")
       {
          NotesText = 'Example : ' + exampleText;
       }
       else if(exampleText == "")
       {
          NotesText = 'Description : ' + descriptionText;
       }
         
       var matched = setCellNotes(sheet.getRange(headingCell).getValue(),targetCellAddress, NotesText);
       Logger.log(matched);
       if(!matched)
       {
         NonMatchingSpec.push(sheet.getRange(headingCell).getValue());
       }
      
    } catch(error) {
      Logger.log(error);
    } 
  }
  var compiles = setBackgroundForNonMatchingIfAny(lastRow-1);
  if(compiles)
  {
     SpreadsheetApp.getUi().alert('This file complies with the Spec');
  }
  else
  {
    if(NonMatchingSpec.length)
    {
    var message = 'This file does NOT comply with the Spec. Following Columns are missing: ';
    for(var i=0; i< NonMatchingSpec.length; i++){
      message = message + NonMatchingSpec[i] + ', ';
    }
    message = message.slice(0, -2);
    message = message + '.';
    SpreadsheetApp.getUi().alert(message);
    }
    else
    {
      var message = 'This file does NOT comply with the Spec. File has some non-matching columns.';
      SpreadsheetApp.getUi().alert(message);
    }
  }

}

function setCellNotes(headingCell,cellAddress, NotesText) {
  if(arguments.length !== 3) {
    throw('Function "setCellNotes" expects three arguments, while ' + arguments.length + ' are given!');
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ws = ss.getActiveSheet();
    var dataRange = ws.getDataRange();
    var values = dataRange.getValues();
    for (var i = 0; i < 1; i++) {
    for (var j = 0; j < values[i].length; j++) {
      if (values[i][j].toLowerCase() == headingCell.toLowerCase()) {
        var cellToComment = ws.getRange(i+1,j+1);
        var comment = cellToComment.setComment(NotesText);
          cellToComment.setBackground('#00bf16');
        return true;
      }
    }    
  }
    
    return false;
  } catch(error) {
    throw('Unable to set comment for sheet.', error);
  }
  
}

function setBackgroundForNonMatchingIfAny(totalSpec){
  var found = true;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getActiveSheet();
  var dataRange = ws.getDataRange();
  var values = dataRange.getValues();
   for (var i = 0; i < 1; i++) {
    for (var j = 0; j < values[i].length; j++) {
      var cell = ws.getRange(i+1,j+1);
      if(cell.getBackground() == "#ffffff")
      {
        cell.setBackground('#ff8c00');
        found = false;
      }
    }    
  }
  if(values[0].length != totalSpec)
  {
    found = false;
  }
  return found;
}

function setBackgroundWhite(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getActiveSheet();
  var dataRange = ws.getDataRange();
  var values = dataRange.getValues();
   for (var i = 0; i < 1; i++) {
    for (var j = 0; j < values[i].length; j++) {
       var cell = ws.getRange(i+1,j+1);
        cell.setBackground('#ffffff');
        cell.clearNote();
    }    
  }
}


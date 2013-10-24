console.log("HERE");
var E = document.getElementById("startPinoccio");
console.log(E);
E.addEventListener("onclick", function() {
  console.log("In the button");
  getPerms();
});

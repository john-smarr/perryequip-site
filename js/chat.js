/* Perry Brothers Equipment — Chat Loader */
(function () {
  var s = document.createElement("script");
  s.src = "/js/chatbot.js";
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      document.body.appendChild(s);
    });
  } else {
    document.body.appendChild(s);
  }
})();

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-print-requisition]")) {
    window.print();
    return;
  }

  if (event.target.closest("[data-close-requisition]")) {
    window.close();
  }
});

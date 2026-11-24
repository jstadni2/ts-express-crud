(function () {
  "use strict";

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getCellData(cell, attrName) {
    if (!cell) {
      return "";
    }

    var explicitValue = cell.getAttribute(attrName);
    if (explicitValue !== null && explicitValue !== undefined && explicitValue !== "") {
      return explicitValue;
    }

    return cell.textContent || "";
  }

  function compareValues(a, b, sortType, direction) {
    if (sortType === "number") {
      var aNumber = Number.parseFloat(String(a).replace(/,/g, ""));
      var bNumber = Number.parseFloat(String(b).replace(/,/g, ""));

      if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber)) {
        return (aNumber - bNumber) * direction;
      }
    }

    if (sortType === "date") {
      var aDate = Date.parse(a);
      var bDate = Date.parse(b);

      if (!Number.isNaN(aDate) && !Number.isNaN(bDate)) {
        return (aDate - bDate) * direction;
      }
    }

    var aText = normalizeText(a);
    var bText = normalizeText(b);

    if (aText < bText) {
      return -1 * direction;
    }
    if (aText > bText) {
      return 1 * direction;
    }
    return 0;
  }

  function initTable(table) {
    var tbody = table.tBodies[0];
    if (!tbody) {
      return;
    }

    var dataRows = Array.from(tbody.querySelectorAll("tr[data-rfd-row]"));
    var emptyRows = Array.from(tbody.querySelectorAll("tr[data-rfd-empty-row]"));
    var noMatchRow = tbody.querySelector("tr[data-rfd-no-match-row]");
    var status = table.parentElement.querySelector("[data-rfd-status]");
    var sortableHeaders = Array.from(table.querySelectorAll("thead th[data-sortable='true']"));
    var filterRow = table.querySelector("[data-rfd-filter-row]");
    var filterCells = Array.from(table.querySelectorAll("[data-rfd-filter-cell]"));
    var filterInputs = Array.from(table.querySelectorAll("[data-rfd-filter-input]"));
    var filterToggles = Array.from(table.querySelectorAll("[data-rfd-filter-toggle]"));

    dataRows.forEach(function (row, index) {
      row.dataset.rfdOriginalIndex = String(index);
    });

    var sortState = {
      columnIndex: -1,
      direction: 0
    };
    var filters = {};

    function hideAllFilterCells() {
      filterCells.forEach(function (cell) {
        cell.hidden = true;
      });
    }

    function anyFilterCellOpen() {
      return filterToggles.some(function (btn) {
        return btn.getAttribute("aria-expanded") === "true";
      });
    }

    function deactivateFilterToggle(toggleButton, clearValue) {
      var cellId = toggleButton.getAttribute("aria-controls");
      var filterCell = cellId ? document.getElementById(cellId) : null;
      toggleButton.setAttribute("aria-expanded", "false");
      if (filterCell) {
        filterCell.hidden = true;
      }

      if (!clearValue || !filterCell) {
        return;
      }

      var input = filterCell.querySelector("[data-rfd-filter-input]");
      if (!input) {
        return;
      }

      if (input.value !== "") {
        input.value = "";
      }

      var colIndex = input.getAttribute("data-column-index");
      filters[colIndex] = "";
      applyFiltersAndSort();
    }

    function updateSortIndicators() {
      sortableHeaders.forEach(function (header, index) {
        var direction = 0;
        if (index === sortState.columnIndex) {
          direction = sortState.direction;
        }

        var sortIndicator = header.querySelector("[data-rfd-sort-indicator]");
        var sortText = header.querySelector("[data-rfd-sort-text]");
        var labelNode = header.querySelector(".rfd-th-label");
        var label = labelNode ? labelNode.textContent.trim() : "column";

        if (direction === 1) {
          header.setAttribute("aria-sort", "ascending");
          if (sortIndicator) {
            sortIndicator.textContent = "A-Z";
          }
          if (sortText) {
            sortText.textContent = "Sort " + label + " ascending";
          }
        } else if (direction === -1) {
          header.setAttribute("aria-sort", "descending");
          if (sortIndicator) {
            sortIndicator.textContent = "Z-A";
          }
          if (sortText) {
            sortText.textContent = "Sort " + label + " descending";
          }
        } else {
          header.setAttribute("aria-sort", "none");
          if (sortIndicator) {
            sortIndicator.textContent = "<>";
          }
          if (sortText) {
            sortText.textContent = "Sort " + label + " not applied";
          }
        }
      });
    }

    function applyFiltersAndSort() {
      if (dataRows.length === 0) {
        if (status) {
          status.textContent = "No rows available in this table.";
        }
        return;
      }

      var activeFilterIndexes = Object.keys(filters).filter(function (key) {
        return filters[key] !== "";
      });

      var visibleRows = [];
      var hiddenRows = [];

      dataRows.forEach(function (row) {
        var matchesAll = activeFilterIndexes.every(function (key) {
          var colIndex = Number.parseInt(key, 10);
          var filterValue = normalizeText(filters[key]);
          var cell = row.cells[colIndex];
          var cellValue = normalizeText(getCellData(cell, "data-filter-value"));
          return cellValue.indexOf(filterValue) !== -1;
        });

        row.hidden = !matchesAll;
        if (matchesAll) {
          visibleRows.push(row);
        } else {
          hiddenRows.push(row);
        }
      });

      if (sortState.columnIndex >= 0 && sortState.direction !== 0) {
        var activeHeader = sortableHeaders[sortState.columnIndex];
        var actualColumnIndex = Number.parseInt(activeHeader.dataset.rfdColumnIndex, 10);
        var sortType = activeHeader.getAttribute("data-sort-type") || "text";

        visibleRows.sort(function (rowA, rowB) {
          var cellA = rowA.cells[actualColumnIndex];
          var cellB = rowB.cells[actualColumnIndex];
          var valueA = getCellData(cellA, "data-sort-value");
          var valueB = getCellData(cellB, "data-sort-value");

          var comparison = compareValues(valueA, valueB, sortType, sortState.direction);
          if (comparison === 0) {
            return Number.parseInt(rowA.dataset.rfdOriginalIndex, 10) - Number.parseInt(rowB.dataset.rfdOriginalIndex, 10);
          }
          return comparison;
        });
      } else {
        visibleRows.sort(function (rowA, rowB) {
          return Number.parseInt(rowA.dataset.rfdOriginalIndex, 10) - Number.parseInt(rowB.dataset.rfdOriginalIndex, 10);
        });
      }

      visibleRows.concat(hiddenRows).forEach(function (row) {
        tbody.appendChild(row);
      });

      if (noMatchRow) {
        noMatchRow.hidden = visibleRows.length !== 0;
      }
      emptyRows.forEach(function (row) {
        row.hidden = visibleRows.length !== 0;
      });

      if (status) {
        var activeFiltersCount = activeFilterIndexes.length;
        if (visibleRows.length === 0) {
          status.textContent = "No matching records found.";
        } else {
          status.textContent = "Showing " + visibleRows.length + " records" + (activeFiltersCount > 0 ? " after applying " + activeFiltersCount + " filters." : ".");
        }
      }
    }

    sortableHeaders.forEach(function (header, sortableIndex) {
      var sortButton = header.querySelector("[data-rfd-sort-button]");
      if (!sortButton) {
        return;
      }

      var columnIndex = Array.prototype.indexOf.call(header.parentElement.children, header);
      header.dataset.rfdColumnIndex = String(columnIndex);

      sortButton.addEventListener("click", function () {
        if (sortState.columnIndex !== sortableIndex) {
          sortState.columnIndex = sortableIndex;
          sortState.direction = 1;
        } else if (sortState.direction === 1) {
          sortState.direction = -1;
        } else if (sortState.direction === -1) {
          sortState.direction = 0;
          sortState.columnIndex = -1;
        } else {
          sortState.direction = 1;
        }

        updateSortIndicators();
        applyFiltersAndSort();
      });
    });

    filterToggles.forEach(function (toggleButton) {
      toggleButton.addEventListener("click", function () {
        var cellId = toggleButton.getAttribute("aria-controls");
        var filterCell = cellId ? document.getElementById(cellId) : null;
        if (!filterCell) {
          return;
        }

        var isOpen = toggleButton.getAttribute("aria-expanded") === "true";

        if (isOpen) {
          deactivateFilterToggle(toggleButton, true);
          if (filterRow && !anyFilterCellOpen()) {
            filterRow.hidden = true;
          }
          return;
        }

        if (filterRow) {
          filterRow.hidden = false;
        }
        toggleButton.setAttribute("aria-expanded", "true");
        filterCell.hidden = false;

        var input = filterCell.querySelector("[data-rfd-filter-input]");
        if (input) {
          input.focus();
        }
      });
    });

    filterInputs.forEach(function (input) {
      input.addEventListener("input", function () {
        var colIndex = input.getAttribute("data-column-index");
        filters[colIndex] = input.value || "";
        applyFiltersAndSort();
      });

      input.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          var filterCell = input.closest("[data-rfd-filter-cell]");
          if (!filterCell) {
            return;
          }

          filterCell.hidden = true;
          var cellId = filterCell.id;
          var toggleButton = cellId ? table.querySelector("[data-rfd-filter-toggle][aria-controls='" + cellId + "']") : null;
          if (toggleButton) {
            toggleButton.setAttribute("aria-expanded", "false");
            toggleButton.focus();
          }

          if (filterRow && !anyFilterCellOpen()) {
            filterRow.hidden = true;
          }
        }
      });
    });

    updateSortIndicators();
    applyFiltersAndSort();
  }

  function initTables() {
    var tables = Array.from(document.querySelectorAll("table[data-rfd-enhanced-table]"));
    tables.forEach(initTable);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTables);
  } else {
    initTables();
  }
}());

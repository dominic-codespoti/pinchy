// Pinchy Views — Skills (global skill registry)
(function () {
  "use strict";
  window.PinchyViews = window.PinchyViews || {};

  window.PinchyViews.skills = {
    init: function (ctx) {
      var container = ctx.container;
      container.innerHTML =
        '<div class="section-header"><h2>Skills</h2></div>' +
        '<div class="grid-3" id="skills-grid"></div>';

      var grid = document.getElementById("skills-grid");
      ctx.showLoading(grid);

      function load() {
        PinchyAPI.getSkills().then(function (data) {
          var skills = data.skills || [];
          if (!skills.length) {
            grid.innerHTML = '<div class="placeholder">No global skills registered</div>';
            return;
          }
          grid.innerHTML = "";
          skills.forEach(function (s) {
            var card = document.createElement("div");
            card.className = "card-static";
            card.innerHTML =
              '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">' +
                '<h3 style="font-size:0.95rem;">' + ctx.escapeHtml(s.id || "unknown") + '</h3>' +
                (s.operator_managed ? '<span class="badge badge-ok" style="font-size:0.62rem;">operator</span>' : '') +
              '</div>' +
              (s.description ? '<p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.4rem;">' + ctx.escapeHtml(s.description) + '</p>' : '') +
              '<p style="font-size:0.76rem;color:var(--text-secondary);">Version: ' + ctx.escapeHtml(s.version || "—") + '</p>' +
              '<p style="font-size:0.76rem;color:var(--text-secondary);">Scope: ' + ctx.escapeHtml(s.scope || "global") + '</p>' +
              '<p style="font-size:0.76rem;color:var(--text-secondary);">Backend: ' + ctx.escapeHtml(s.backend || "—") + '</p>';
            grid.appendChild(card);
          });
        }).catch(function (err) {
          ctx.showErrorWithRetry(grid, "Failed to load skills: " + (err.message || String(err)), load);
        });
      }

      load();

      return {
        refresh: load,
        destroy: function () {},
      };
    }
  };
})();

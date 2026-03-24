(function () {
    "use strict";
    var mermaidLayoutCounter = 0;

    var cytoscapeStyle = [
        { selector: "node.cluster", style: {
            "shape": "round-rectangle",
            "background-color": "#161b22",
            "border-color": "data(color)",
            "border-width": 2,
            "label": "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "color": "#e6edf3",
            "font-size": "14px",
            "width": 160,
            "height": 80,
            "text-wrap": "wrap",
            "text-max-width": "140px",
            "padding": "10px",
            "cursor": "pointer"
        }},
        { selector: "node.system", style: {
            "shape": "round-rectangle",
            "background-color": "#161b22",
            "border-color": "data(color)",
            "border-width": 2,
            "label": "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "color": "#e6edf3",
            "font-size": "13px",
            "width": 150,
            "height": 70,
            "text-wrap": "wrap",
            "text-max-width": "130px",
            "cursor": "pointer"
        }},
        { selector: "node.external", style: {
            "shape": "round-rectangle",
            "background-color": "#0d1117",
            "border-color": "#30363d",
            "border-width": 1,
            "border-style": "dashed",
            "label": "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "color": "#6e7681",
            "font-size": "12px",
            "width": 130,
            "height": 60,
            "opacity": 0.7
        }},
        { selector: "node.store", style: {
            "shape": "barrel",
            "background-color": "#1a1a10",
            "border-color": "#d29922",
            "border-width": 2,
            "label": "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "color": "#e6edf3",
            "font-size": "12px",
            "width": 120,
            "height": 60,
            "cursor": "pointer"
        }},
        { selector: "edge.cluster-edge", style: {
            "curve-style": "bezier",
            "control-point-step-size": 40,
            "target-arrow-shape": "triangle",
            "line-color": "#30363d",
            "target-arrow-color": "#30363d",
            "width": 2,
            "label": "data(label)",
            "font-size": "10px",
            "color": "#6e7681",
            "text-background-color": "#0d1117",
            "text-background-opacity": 0.8,
            "text-background-padding": "3px",
            "cursor": "pointer"
        }},
        { selector: "edge.system-edge", style: {
            "curve-style": "bezier",
            "control-point-step-size": 40,
            "target-arrow-shape": "triangle",
            "line-color": "#484f58",
            "target-arrow-color": "#484f58",
            "width": 2,
            "label": "data(label)",
            "font-size": "9px",
            "color": "#6e7681",
            "text-background-color": "#0d1117",
            "text-background-opacity": 0.8,
            "text-background-padding": "2px",
            "cursor": "pointer"
        }},
        { selector: "edge.store-edge", style: {
            "curve-style": "bezier",
            "control-point-step-size": 40,
            "target-arrow-shape": "triangle",
            "line-color": "#d29922",
            "target-arrow-color": "#d29922",
            "width": 1,
            "line-style": "dashed",
            "opacity": 0.6
        }},
        { selector: "node.module-group", style: {
            "shape": "round-rectangle",
            "background-color": "rgba(22, 27, 34, 0.5)",
            "border-color": "#30363d",
            "border-width": 1,
            "label": "data(label)",
            "text-valign": "top",
            "text-halign": "center",
            "color": "#9aa4af",
            "font-size": "11px",
            "padding": "18px",
            "text-margin-y": "-4px"
        }},
        { selector: "node.file-node", style: {
            "shape": "round-rectangle",
            "background-color": "#161b22",
            "border-color": "data(color)",
            "border-width": 2,
            "label": "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "color": "#e6edf3",
            "font-size": "11px",
            "width": 130,
            "height": 50,
            "text-wrap": "wrap",
            "text-max-width": "120px",
            "cursor": "pointer"
        }},
        { selector: "node.agent-node", style: {
            "shape": "hexagon",
            "background-color": "#1a1525",
            "border-color": "#9D7BEE",
            "border-width": 2,
            "label": "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "color": "#e6edf3",
            "font-size": "11px",
            "width": 130,
            "height": 50,
            "cursor": "pointer"
        }},
        { selector: "node.behavioral-lifecycle", style: {
            "shape": "round-rectangle",
            "background-color": "#13202d",
            "border-color": "#58a6ff",
            "border-width": 2,
            "label": "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "color": "#e6edf3",
            "font-size": "14px",
            "font-weight": 600,
            "width": 220,
            "height": 92,
            "text-wrap": "wrap",
            "text-max-width": "190px",
            "padding": "12px"
        }},
        { selector: "node.behavioral-stage", style: {
            "shape": "round-rectangle",
            "background-color": "#1c2333",
            "border-color": "#7ee787",
            "border-width": 2,
            "label": "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "color": "#e6edf3",
            "font-size": "13px",
            "width": 180,
            "height": 78,
            "text-wrap": "wrap",
            "text-max-width": "150px",
            "padding": "10px"
        }},
        { selector: "node.behavioral-step", style: {
            "shape": "round-rectangle",
            "background-color": "#252d3a",
            "border-color": "#d29922",
            "border-width": 2,
            "label": "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "color": "#e6edf3",
            "font-size": "12px",
            "width": 170,
            "height": 72,
            "text-wrap": "wrap",
            "text-max-width": "145px",
            "padding": "10px"
        }},
        { selector: "edge.file-import", style: {
            "curve-style": "bezier",
            "control-point-step-size": 40,
            "target-arrow-shape": "triangle",
            "line-color": "#30363d",
            "target-arrow-color": "#30363d",
            "width": 1.5
        }},
        { selector: "edge.agent-invoke", style: {
            "curve-style": "bezier",
            "control-point-step-size": 40,
            "target-arrow-shape": "triangle",
            "line-color": "#9D7BEE",
            "target-arrow-color": "#9D7BEE",
            "width": 1.5,
            "line-style": "dashed"
        }},
        { selector: "edge.behavioral-edge", style: {
            "curve-style": "bezier",
            "control-point-step-size": 36,
            "target-arrow-shape": "triangle",
            "line-color": "#58a6ff",
            "target-arrow-color": "#58a6ff",
            "width": 2.5,
            "label": "data(label)",
            "font-size": "10px",
            "color": "#9aa4af",
            "text-background-color": "#0d1117",
            "text-background-opacity": 0.78,
            "text-background-padding": "3px"
        }},
        { selector: "edge[_segmentWeights]", style: {
            "curve-style": "unbundled-bezier",
            "control-point-weights": "data(_segmentWeights)",
            "control-point-distances": "data(_segmentDistances)",
            "edge-distances": "node-position"
        }},
        { selector: "node:active, node:selected", style: {
            "overlay-opacity": 0.1
        }},
        { selector: ".highlighted", style: {
            "border-width": 3,
            "border-color": "#58a6ff",
            "z-index": 999,
            "z-index-compare": "manual",
            "transition-property": "border-width, border-color, opacity",
            "transition-duration": "0.15s"
        }},
        { selector: "edge.highlighted", style: {
            "line-color": "#58a6ff",
            "target-arrow-color": "#58a6ff",
            "width": 3,
            "z-index": 999,
            "z-index-compare": "manual",
            "opacity": 1
        }},
        { selector: "edge.flow-animated", style: {
            "line-style": "dashed",
            "line-dash-pattern": [10, 6],
            "line-dash-offset": 0
        }},
        { selector: ".neighbor-highlighted", style: {
            "border-width": 2.5,
            "opacity": 1,
            "z-index": 998,
            "z-index-compare": "manual"
        }},
        { selector: ".dimmed", style: {
            "opacity": 0.25,
            "transition-property": "opacity",
            "transition-duration": "0.15s"
        }}
    ];

    const state = {
        baseUrl: null,
        pageCache: new Map(),
        stack: [{ type: "root" }],
        requestToken: 0,
        fragmentCounter: 0,
        _diagramRendered: false,
        currentClusterMeta: null,
        currentSystemMeta: null,
        currentPanelMeta: null,
        rootCy: null,
        rootBehavioralCy: null,
        viewportCy: null,
        pendingViewportTransition: null,
        rootView: "organizational",
        elements: {}
    };

    function fallbackLayout(padding) {
        return {
            name: "breadthfirst",
            directed: true,
            padding: padding || 40,
            fit: true,
            avoidOverlap: true,
            spacingFactor: 1.5
        };
    }

    function presetLayout() {
        return { name: "preset" };
    }

    function getDiagramPadding(level) {
        if (level === "system") {
            return 36;
        }
        return 48;
    }

    function getFallbackLayout(level) {
        return fallbackLayout(getDiagramPadding(level));
    }

    function behavioralRootLayout() {
        return {
            name: "grid",
            rows: 1,
            padding: 60,
            fit: true,
            avoidOverlap: true,
            avoidOverlapPadding: 40
        };
    }

    function fitCytoscapeInstance(cy, padding) {
        if (!cy) {
            return;
        }
        cy.resize();
        cy.fit(cy.elements(), padding);
    }

    function behavioralRootAvailable() {
        return !!(
            state.elements.rootBehavioralCy
            && String(state.elements.rootBehavioralCy.getAttribute("data-elements") || "").trim() !== ""
            && String(state.elements.rootBehavioralCy.getAttribute("data-elements") || "").trim() !== "[]"
        );
    }

    function readRootDefaultView() {
        if (!state.elements.rootStage) {
            return "organizational";
        }
        var requested = state.elements.rootStage.getAttribute("data-default-view");
        if (requested === "behavioral" && behavioralRootAvailable()) {
            return "behavioral";
        }
        return "organizational";
    }

    function activeRootCy() {
        if (state.rootView === "behavioral" && state.rootBehavioralCy) {
            return state.rootBehavioralCy;
        }
        return state.rootCy;
    }

    function parseSvgNumber(value, fallback) {
        var parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : (fallback || 0);
    }

    function distanceBetween(a, b) {
        if (!a || !b) {
            return Number.POSITIVE_INFINITY;
        }
        var dx = (a.x || 0) - (b.x || 0);
        var dy = (a.y || 0) - (b.y || 0);
        return Math.sqrt(dx * dx + dy * dy);
    }

    function extractRenderedNodeId(element) {
        if (!element) {
            return "";
        }
        var candidates = [
            element.getAttribute("data-id"),
            element.id,
            element.getAttribute("id")
        ];
        for (var i = 0; i < candidates.length; i += 1) {
            var raw = String(candidates[i] || "").trim();
            if (!raw) {
                continue;
            }
            var flowchartMatch = raw.match(/^flowchart-(.+)-\d+$/);
            if (flowchartMatch) {
                return flowchartMatch[1];
            }
            if (raw.indexOf("flowchart-") === 0) {
                return raw.slice("flowchart-".length);
            }
            return raw;
        }
        return "";
    }

    function parseSvgPath(d) {
        var points = [];
        var commands = String(d || "").match(/[MLCQZ][^MLCQZ]*/gi) || [];
        commands.forEach(function (command) {
            var type = command.charAt(0).toUpperCase();
            var coords = command.slice(1).trim();
            if (!coords || type === "Z") {
                return;
            }
            var values = coords.split(/[\s,]+/).filter(Boolean).map(function (value) {
                return parseFloat(value);
            }).filter(function (value) {
                return !Number.isNaN(value);
            });
            var index = 0;
            if (type === "M" || type === "L") {
                while (index + 1 < values.length) {
                    points.push({ x: values[index], y: values[index + 1] });
                    index += 2;
                }
                return;
            }
            if (type === "C") {
                while (index + 5 < values.length) {
                    points.push({ x: values[index + 2], y: values[index + 3] });
                    points.push({ x: values[index + 4], y: values[index + 5] });
                    index += 6;
                }
                return;
            }
            if (type === "Q") {
                while (index + 3 < values.length) {
                    points.push({ x: values[index], y: values[index + 1] });
                    points.push({ x: values[index + 2], y: values[index + 3] });
                    index += 4;
                }
            }
        });
        return points;
    }

    async function renderMermaidSvg(mermaidText, elementId) {
        if (!window.mermaid || !mermaidText) {
            return "";
        }
        if (typeof window.mermaid.render === "function") {
            var rendered = await window.mermaid.render(
                elementId + "_layout_" + (++mermaidLayoutCounter),
                mermaidText
            );
            return rendered && rendered.svg ? rendered.svg : "";
        }
        if (typeof window.mermaid.run === "function") {
            var host = document.createElement("div");
            host.className = "cy-mermaid-layout";
            host.dataset.level = elementId;
            host.style.position = "absolute";
            host.style.left = "-9999px";
            host.style.top = "-9999px";
            host.style.visibility = "hidden";
            host.textContent = mermaidText;
            document.body.appendChild(host);
            try {
                await window.mermaid.run({ nodes: [host], suppressErrors: true });
                var svg = host.querySelector("svg");
                return svg ? svg.outerHTML : "";
            } finally {
                host.remove();
            }
        }
        return "";
    }

    async function computeMermaidLayout(mermaidText, elementId) {
        if (!window.mermaid || !mermaidText) {
            return null;
        }
        try {
            var svgString = await renderMermaidSvg(mermaidText, elementId);
            if (!svgString) {
                return null;
            }
            var parser = new DOMParser();
            var doc = parser.parseFromString(svgString, "image/svg+xml");
            var svg = doc.querySelector("svg");
            if (!svg) {
                return null;
            }

            var nodePositions = {};
            svg.querySelectorAll("g.node").forEach(function (element) {
                var id = extractRenderedNodeId(element);
                var transform = element.getAttribute("transform") || "";
                var match = transform.match(/translate\s*\(\s*([\d.e+-]+)\s*[,\s]\s*([\d.e+-]+)/);
                if (!id || !match) {
                    return;
                }
                nodePositions[id] = {
                    x: parseFloat(match[1]),
                    y: parseFloat(match[2])
                };
            });

            var edgePaths = [];
            svg.querySelectorAll("path.flowchart-link, path.path").forEach(function (pathElement) {
                var d = pathElement.getAttribute("d");
                if (d) {
                    edgePaths.push(parseSvgPath(d));
                }
            });

            var clusterBounds = {};
            svg.querySelectorAll("g.cluster").forEach(function (element) {
                var id = extractRenderedNodeId(element);
                var rect = element.querySelector("rect");
                if (!id || !rect) {
                    return;
                }
                clusterBounds[id] = {
                    x: parseSvgNumber(rect.getAttribute("x"), 0),
                    y: parseSvgNumber(rect.getAttribute("y"), 0),
                    width: parseSvgNumber(rect.getAttribute("width"), 0),
                    height: parseSvgNumber(rect.getAttribute("height"), 0)
                };
            });

            var viewBox = (svg.getAttribute("viewBox") || "").split(/\s+/).map(function (value) {
                return parseFloat(value);
            });
            return {
                nodePositions: nodePositions,
                edgePaths: edgePaths,
                clusterBounds: clusterBounds,
                svgWidth: parseSvgNumber(svg.getAttribute("width"), viewBox[2] || 800),
                svgHeight: parseSvgNumber(svg.getAttribute("height"), viewBox[3] || 600)
            };
        } catch (error) {
            console.warn("Mermaid layout computation failed:", error);
            return null;
        }
    }

    function convertEdgeWaypoints(points, sourcePos, targetPos) {
        if (!points || points.length < 3 || !sourcePos || !targetPos) {
            return null;
        }

        var normalizedPoints = points.slice();
        var startPoint = normalizedPoints[0];
        var endPoint = normalizedPoints[normalizedPoints.length - 1];
        if (
            distanceBetween(startPoint, targetPos) < distanceBetween(startPoint, sourcePos)
            && distanceBetween(endPoint, sourcePos) < distanceBetween(endPoint, targetPos)
        ) {
            normalizedPoints.reverse();
        }

        var waypoints = normalizedPoints.slice(1, -1);
        if (!waypoints.length) {
            return null;
        }

        var dx = targetPos.x - sourcePos.x;
        var dy = targetPos.y - sourcePos.y;
        var edgeLength = Math.sqrt(dx * dx + dy * dy);
        if (edgeLength < 1) {
            return null;
        }

        var weights = [];
        var distances = [];
        waypoints.forEach(function (point) {
            var wx = point.x - sourcePos.x;
            var wy = point.y - sourcePos.y;
            var weight = (wx * dx + wy * dy) / (edgeLength * edgeLength);
            var distance = (wx * (-dy) + wy * dx) / edgeLength;
            weights.push(Math.round(weight * 1000) / 1000);
            distances.push(Math.round(distance * 10) / 10);
        });

        return {
            weights: weights,
            distances: distances
        };
    }

    function applyMermaidGeometry(elements, layout) {
        if (!layout || !Array.isArray(elements)) {
            return elements;
        }
        var positioned = elements.map(function (element) {
            if (!element || !element.data || !element.data.id) {
                return element;
            }
            var position = layout.nodePositions[element.data.id];
            if (!position || element.data.source || element.data.target) {
                return element;
            }
            return Object.assign({}, element, {
                position: {
                    x: position.x,
                    y: position.y
                }
            });
        });

        var edgeIndex = 0;
        return positioned.map(function (element) {
            if (!element || !element.data || !element.data.source || !element.data.target) {
                return element;
            }
            var pathPoints = layout.edgePaths[edgeIndex] || null;
            edgeIndex += 1;
            if (!pathPoints) {
                return element;
            }
            var sourcePos = layout.nodePositions[element.data.source];
            var targetPos = layout.nodePositions[element.data.target];
            var waypointData = convertEdgeWaypoints(pathPoints, sourcePos, targetPos);
            if (!waypointData) {
                return element;
            }
            return Object.assign({}, element, {
                data: Object.assign({}, element.data, {
                    _segmentWeights: waypointData.weights.join(" "),
                    _segmentDistances: waypointData.distances.join(" ")
                })
            });
        });
    }

    async function prepareDiagramElements(container, level) {
        var elements = parseJsonAttribute(container, "data-elements", []);
        var mermaidText = container.getAttribute("data-mermaid") || "";
        var layout = await computeMermaidLayout(mermaidText, level || container.getAttribute("data-level") || "diagram");
        return {
            elements: applyMermaidGeometry(elements, layout),
            hasMermaidLayout: !!layout
        };
    }

    function prefersReducedMotion() {
        return !!(
            window.matchMedia
            && typeof window.matchMedia === "function"
            && window.matchMedia("(prefers-reduced-motion: reduce)").matches
        );
    }

    function nextFrame() {
        return new Promise(function (resolve) {
            if (typeof window.requestAnimationFrame === "function") {
                window.requestAnimationFrame(function () {
                    resolve();
                });
                return;
            }
            window.setTimeout(resolve, 16);
        });
    }

    function hasGraphCollection(collection) {
        return !!(collection && typeof collection.forEach === "function");
    }

    function canHighlightCytoscape(cy) {
        if (!cy || typeof cy.elements !== "function") {
            return false;
        }
        var elements = cy.elements();
        return !!(elements && typeof elements.addClass === "function" && typeof elements.removeClass === "function");
    }

    function canAnimateCytoscape(cy) {
        return !!(
            cy
            && typeof cy.nodes === "function"
            && typeof cy.edges === "function"
            && typeof cy.extent === "function"
        );
    }

    function clearCytoscapeHighlighting(cy) {
        if (!canHighlightCytoscape(cy)) {
            return;
        }
        stopEdgeDirectionAnimation(cy);
        cy.elements().removeClass("dimmed highlighted neighbor-highlighted flow-animated");
        if (hasGraphCollection(cy.edges())) {
            resetEdgeDirectionStyles(cy.edges());
        }
    }

    function canStyleGraphElement(element) {
        return !!(element && typeof element.style === "function");
    }

    function readEdgeDirectionAnimation(cy) {
        if (!cy) {
            return null;
        }
        if (typeof cy.scratch === "function") {
            return cy.scratch("_edgeDirectionAnimation") || null;
        }
        return cy.__edgeDirectionAnimation || null;
    }

    function writeEdgeDirectionAnimation(cy, animation) {
        if (!cy) {
            return;
        }
        if (typeof cy.scratch === "function") {
            cy.scratch("_edgeDirectionAnimation", animation);
            return;
        }
        cy.__edgeDirectionAnimation = animation;
    }

    function clearEdgeDirectionAnimation(cy) {
        if (!cy) {
            return;
        }
        if (typeof cy.removeScratch === "function") {
            cy.removeScratch("_edgeDirectionAnimation");
            return;
        }
        delete cy.__edgeDirectionAnimation;
    }

    function clearGraphStyle(element, propertyName) {
        if (!element || !propertyName) {
            return;
        }
        if (typeof element.removeStyle === "function") {
            element.removeStyle(propertyName);
            return;
        }
        if (typeof element.removeCss === "function") {
            element.removeCss(propertyName);
            return;
        }
        if (typeof element.style === "function") {
            element.style(propertyName, "");
        }
    }

    function resetEdgeDirectionStyles(edges) {
        if (!hasGraphCollection(edges)) {
            return;
        }
        edges.forEach(function (edge) {
            clearGraphStyle(edge, "line-style");
            clearGraphStyle(edge, "line-dash-pattern");
            clearGraphStyle(edge, "line-dash-offset");
        });
    }

    function stopEdgeDirectionAnimation(cy) {
        var active = readEdgeDirectionAnimation(cy);
        if (!active) {
            return;
        }
        if (typeof active.cancel === "function") {
            active.cancel();
        }
        if (active.edges && typeof active.edges.removeClass === "function") {
            active.edges.removeClass("flow-animated");
        }
        resetEdgeDirectionStyles(active.edges);
        clearEdgeDirectionAnimation(cy);
    }

    function startEdgeDirectionAnimation(cy, edges) {
        if (prefersReducedMotion() || !hasGraphCollection(edges) || edges.length === 0) {
            return;
        }

        stopEdgeDirectionAnimation(cy);
        if (typeof edges.addClass === "function") {
            edges.addClass("flow-animated");
        }
        edges.forEach(function (edge) {
            if (!canStyleGraphElement(edge)) {
                return;
            }
            edge.style({
                "line-style": "dashed",
                "line-dash-pattern": [8, 4],
                "line-dash-offset": 0
            });
        });

        var dashOffset = 0;
        var cancelled = false;
        var cancelScheduledFrame = null;

        function scheduleNextFrame(callback) {
            if (typeof window.requestAnimationFrame === "function") {
                var frameId = window.requestAnimationFrame(callback);
                return function () {
                    if (typeof window.cancelAnimationFrame === "function") {
                        window.cancelAnimationFrame(frameId);
                    }
                };
            }
            var timeoutId = window.setTimeout(callback, 16);
            return function () {
                window.clearTimeout(timeoutId);
            };
        }

        function applyOffset() {
            if (cancelled) {
                return;
            }
            dashOffset = (dashOffset + 1) % 40;
            edges.forEach(function (edge) {
                if (canStyleGraphElement(edge)) {
                    edge.style("line-dash-offset", -dashOffset);
                }
            });
            cancelScheduledFrame = scheduleNextFrame(applyOffset);
        }

        writeEdgeDirectionAnimation(cy, {
            edges: edges,
            cancel: function () {
                cancelled = true;
                if (typeof cancelScheduledFrame === "function") {
                    cancelScheduledFrame();
                    cancelScheduledFrame = null;
                }
            }
        });

        applyOffset();
    }

    function playAnimation(animation) {
        if (!animation || typeof animation.play !== "function" || typeof animation.promise !== "function") {
            return Promise.resolve();
        }
        animation.play();
        return animation.promise("completed").catch(function () {
            return null;
        });
    }

    function snapshotNodePositions(cy) {
        var positions = {};
        if (!canAnimateCytoscape(cy) || !hasGraphCollection(cy.nodes())) {
            return positions;
        }
        cy.nodes().forEach(function (node) {
            if (!node || typeof node.id !== "function" || typeof node.position !== "function") {
                return;
            }
            positions[node.id()] = {
                x: node.position("x"),
                y: node.position("y")
            };
        });
        return positions;
    }

    function storeRevealTargetPositions(cy, positions) {
        if (!cy || !positions) {
            return;
        }
        if (typeof cy.scratch === "function") {
            cy.scratch("_revealTargetPositions", positions);
            return;
        }
        cy.__revealTargetPositions = positions;
    }

    function readRevealTargetPositions(cy) {
        if (!cy) {
            return null;
        }
        if (typeof cy.scratch === "function") {
            return cy.scratch("_revealTargetPositions");
        }
        return cy.__revealTargetPositions || null;
    }

    function clearRevealTargetPositions(cy) {
        if (!cy) {
            return;
        }
        if (typeof cy.removeScratch === "function") {
            cy.removeScratch("_revealTargetPositions");
            return;
        }
        delete cy.__revealTargetPositions;
    }

    function animateCollectionOpacity(collection, opacity, duration) {
        if (!hasGraphCollection(collection)) {
            return [];
        }
        var promises = [];
        collection.forEach(function (element) {
            if (!element || typeof element.animation !== "function") {
                return;
            }
            promises.push(playAnimation(element.animation(
                { style: { opacity: opacity } },
                { duration: duration, easing: "ease-in-out" }
            )));
        });
        return promises;
    }

    function finalizeCytoscapeReveal(cy, targetPositions) {
        if (!canAnimateCytoscape(cy)) {
            return;
        }
        cy.nodes().forEach(function (node) {
            if (!node || typeof node.id !== "function") {
                return;
            }
            var target = targetPositions && targetPositions[node.id()];
            if (target && typeof node.position === "function") {
                node.position(target);
            }
            if (typeof node.style === "function") {
                node.style({ opacity: 1 });
            }
        });
        if (hasGraphCollection(cy.edges())) {
            cy.edges().forEach(function (edge) {
                if (edge && typeof edge.style === "function") {
                    edge.style({ opacity: 1 });
                }
            });
        }
    }

    function animateCytoscapeExpandOut(cy, originNodeId) {
        return new Promise(function (resolve) {
            if (prefersReducedMotion() || !canAnimateCytoscape(cy) || !hasGraphCollection(cy.nodes()) || cy.nodes().length === 0) {
                resolve();
                return;
            }

            storeRevealTargetPositions(cy, snapshotNodePositions(cy));

            var center = cy.extent();
            var cx = (center.x1 + center.x2) / 2;
            var cy2 = (center.y1 + center.y2) / 2;
            var origin = originNodeId && typeof cy.getElementById === "function" ? cy.getElementById(originNodeId) : null;
            var hasOrigin = !!(origin && origin.length && typeof origin.position === "function");
            var ox = hasOrigin ? origin.position("x") : cx;
            var oy = hasOrigin ? origin.position("y") : cy2;
            var animations = [];

            cy.nodes().forEach(function (node) {
                if (!node || typeof node.position !== "function" || typeof node.animation !== "function") {
                    return;
                }
                var pos = node.position();
                var dx = pos.x - ox;
                var dy = pos.y - oy;
                var dist = Math.sqrt(dx * dx + dy * dy) || 1;
                var scale = 3 + (dist * 0.01);
                animations.push(playAnimation(node.animation({
                    position: { x: ox + dx * scale, y: oy + dy * scale },
                    style: { opacity: 0 }
                }, { duration: 400, easing: "ease-in-out" })));
            });

            Promise.all(animations.concat(animateCollectionOpacity(cy.edges(), 0, 300))).then(function () {
                resolve();
            });
        });
    }

    function animateCytoscapeContractIn(cy) {
        return new Promise(function (resolve) {
            if (prefersReducedMotion() || !canAnimateCytoscape(cy) || !hasGraphCollection(cy.nodes()) || cy.nodes().length === 0) {
                resolve();
                return;
            }

            var center = cy.extent();
            var cx = (center.x1 + center.x2) / 2;
            var cy2 = (center.y1 + center.y2) / 2;
            var animations = [];

            cy.nodes().forEach(function (node) {
                if (!node || typeof node.animation !== "function") {
                    return;
                }
                animations.push(playAnimation(node.animation({
                    position: { x: cx, y: cy2 },
                    style: { opacity: 0 }
                }, { duration: 400, easing: "ease-in-out" })));
            });

            Promise.all(animations.concat(animateCollectionOpacity(cy.edges(), 0, 300))).then(function () {
                resolve();
            });
        });
    }

    function animateCytoscapeRevealIn(cy) {
        return new Promise(function (resolve) {
            if (prefersReducedMotion() || !canAnimateCytoscape(cy) || !hasGraphCollection(cy.nodes()) || cy.nodes().length === 0) {
                finalizeCytoscapeReveal(cy, readRevealTargetPositions(cy));
                clearRevealTargetPositions(cy);
                resolve();
                return;
            }

            var center = cy.extent();
            var cx = (center.x1 + center.x2) / 2;
            var cy2 = (center.y1 + center.y2) / 2;
            var targetPositions = readRevealTargetPositions(cy);
            if (!targetPositions || Object.keys(targetPositions).length === 0) {
                targetPositions = snapshotNodePositions(cy);
            }
            clearRevealTargetPositions(cy);

            cy.nodes().forEach(function (node) {
                if (!node || typeof node.position !== "function" || typeof node.style !== "function") {
                    return;
                }
                node.position({ x: cx, y: cy2 });
                node.style({ opacity: 0 });
            });

            if (hasGraphCollection(cy.edges())) {
                cy.edges().forEach(function (edge) {
                    if (edge && typeof edge.style === "function") {
                        edge.style({ opacity: 0 });
                    }
                });
            }

            var startAnimation = function () {
                var animations = [];
                cy.nodes().forEach(function (node) {
                    if (!node || typeof node.id !== "function" || typeof node.animation !== "function") {
                        return;
                    }
                    var target = targetPositions[node.id()];
                    if (!target) {
                        return;
                    }
                    animations.push(playAnimation(node.animation({
                        position: target,
                        style: { opacity: 1 }
                    }, { duration: 500, easing: "ease-out" })));
                });

                var edgePromise = new Promise(function (edgeResolve) {
                    window.setTimeout(function () {
                        Promise.all(animateCollectionOpacity(cy.edges(), 1, 300)).then(function () {
                            edgeResolve();
                        });
                    }, 200);
                });

                Promise.all(animations).then(function () {
                    edgePromise.then(function () {
                        finalizeCytoscapeReveal(cy, targetPositions);
                        resolve();
                    });
                });
            };

            startAnimation();
        });
    }

    function bindCytoscapeHighlighting(cy) {
        if (!cy || typeof cy.on !== "function") {
            return;
        }

        var hoveredNode = null;

        cy.on("mouseover", "node", function (evt) {
            var node = evt && evt.target ? evt.target : null;
            if (!node) {
                return;
            }
            if (typeof node.isParent === "function" && node.isParent()) {
                return;
            }
            if (!canHighlightCytoscape(cy) || typeof node.connectedEdges !== "function" || typeof node.neighborhood !== "function") {
                return;
            }
            hoveredNode = node;
            cy.elements().addClass("dimmed");
            node.removeClass("dimmed").addClass("highlighted");
            var connectedEdges = node.connectedEdges();
            connectedEdges.removeClass("dimmed").addClass("highlighted");
            node.neighborhood("node").removeClass("dimmed").addClass("neighbor-highlighted");
            startEdgeDirectionAnimation(cy, connectedEdges);
        });

        cy.on("mouseout", "node", function () {
            hoveredNode = null;
            clearCytoscapeHighlighting(cy);
        });

        cy.on("mouseover", "edge", function (evt) {
            if (hoveredNode) return;
            var edge = evt && evt.target ? evt.target : null;
            if (!edge || !canHighlightCytoscape(cy) || typeof edge.connectedNodes !== "function") {
                return;
            }
            stopEdgeDirectionAnimation(cy);
            cy.elements().addClass("dimmed");
            edge.removeClass("dimmed").addClass("highlighted");
            edge.connectedNodes().removeClass("dimmed").addClass("highlighted");
        });

        cy.on("mouseout", "edge", function () {
            if (hoveredNode) return;
            clearCytoscapeHighlighting(cy);
        });
    }

    document.addEventListener("DOMContentLoaded", initialize);

    window.drillDown = function (clusterId, label) {
        if (!clusterId) {
            return;
        }
        if (!isIndexPage()) {
            window.location.href = resolveClusterUrl(clusterId).href;
            return;
        }
        openCluster(clusterId, clusterId, label || "");
    };

    window.systemClick = async function (systemId, label) {
        if (!systemId) {
            return;
        }
        if (!isIndexPage()) {
            window.location.href = resolveSystemUrl(systemId).href;
            return;
        }
        const payload = await fetchPage(resolveSystemUrl(systemId).href);
        const clusterId = payload.clusterId || currentClusterId();
        if (payload.hasDiagram) {
            openSystemDiagram(systemId, clusterId, systemId, payload.title || label || systemId);
            return;
        }
        openSystem(systemId, clusterId, payload.title || label || systemId);
    };

    window.storeClick = async function (storeId, label) {
        if (!storeId) {
            return;
        }
        if (!isIndexPage()) {
            window.location.href = resolveStoreUrl(storeId).href;
            return;
        }
        var payload = await fetchPage(resolveStoreUrl(storeId).href);
        openStore(storeId, payload.title || label || storeId);
    };

    window.moduleClick = async function (moduleId, label) {
        const resolvedModuleId = resolveModuleClickTarget(moduleId);
        if (!resolvedModuleId) {
            return;
        }
        if (!isIndexPage()) {
            window.location.href = resolveModuleUrl(resolvedModuleId).href;
            return;
        }
        const payload = await fetchPage(resolveModuleUrl(resolvedModuleId).href);
        openModule(
            resolvedModuleId,
            payload.systemId || moduleSystemId(resolvedModuleId),
            payload.clusterId || currentClusterId(),
            payload.title || label || resolvedModuleId
        );
    };

    window.agentClick = async function (agentId, label) {
        if (!agentId) {
            return;
        }
        if (!isIndexPage()) {
            var url = resolveAgentUrl(agentId);
            window.location.href = url.href;
            return;
        }
        var payload = await fetchPage(resolveAgentUrl(agentId).href);
        if (!payload) {
            return;
        }
        var systemId = payload.systemId || "";
        var clusterId = payload.clusterId || currentClusterId() || "";
        openAgent(agentId, systemId, clusterId, payload.title || label || agentId);
    };

    async function initialize() {
        state.baseUrl = computeBaseUrl();
        cacheElements();
        initDetailsToggle(document);
        bindGlobalEvents();
        if (window.mermaid && typeof window.mermaid.initialize === "function") {
            window.mermaid.initialize({
                startOnLoad: false,
                theme: "dark",
                securityLevel: "loose"
            });
        }
        await initRootCytoscape();
        await setRootView(readRootDefaultView(), { skipRefit: true });
        await initClusterCytoscape(document.querySelector('.cy-container[data-level="cluster"]'));
        await initStandaloneSystemCytoscape(document);

        if (!isIndexPage()) {
            return;
        }

        updateNavigation();
        await renderCurrentState();
    }

    function isIndexPage() {
        return document.body.classList.contains("diagram-index");
    }

    function computeBaseUrl() {
        return isIndexPage()
            ? new URL("./", window.location.href)
            : new URL("../", window.location.href);
    }

    async function initRootCytoscape() {
        var container = state.elements.rootCy || document.getElementById("root-cy");
        if (!isIndexPage() || !container || !window.cytoscape) {
            return null;
        }
        if (state.rootCy) {
            fitRootCytoscape();
            return state.rootCy;
        }

        var edgeClickMap = parseJsonAttribute(container, "data-edge-click-map", {});
        var prepared = await prepareDiagramElements(container, "root");
        var elements = prepared.elements;

        try {
            state.rootCy = window.cytoscape({
                container: container,
                elements: elements,
                style: cytoscapeStyle,
                layout: prepared.hasMermaidLayout ? presetLayout() : getFallbackLayout("root"),
                minZoom: 0.3,
                maxZoom: 4,
                wheelSensitivity: 0.3,
                autoungrabify: true,
                boxSelectionEnabled: false
            });
        } catch (err) {
            console.error("Cytoscape init failed:", err);
            container.textContent = "Diagram failed to load. Check console.";
            container.style.color = "var(--danger)";
            container.style.padding = "2rem";
            return;
        }
        if (!state.rootCy || state.rootCy.elements().length === 0) {
            console.warn("Cytoscape initialized with 0 elements. data-elements:", container.getAttribute("data-elements") ? container.getAttribute("data-elements").substring(0, 200) : "(empty)");
        }

        container.__edgeClickMap = edgeClickMap;
        storeRevealTargetPositions(state.rootCy, snapshotNodePositions(state.rootCy));

        state.rootCy.on("tap", "node", function (evt) {
            var node = evt.target;
            var kind = node.data("kind");
            if (kind === "cluster") {
                window.drillDown(node.data("id"), node.data("label"));
            } else if (kind === "store") {
                window.storeClick(node.data("storeId"), node.data("label"));
            }
        });

        state.rootCy.on("tap", "edge.cluster-edge", function (evt) {
            var edge = evt.target;
            var match = edgeClickMap[edge.data("id")] || {
                label: edge.data("label") || "",
                from: edge.data("source") || "",
                to: edge.data("target") || "",
                pages: edge.data("pages") || []
            };
            openEdgeMatch(match, edge.data("label") || match.label || "");
        });

        bindCytoscapeHighlighting(state.rootCy);
        fitRootCytoscape("organizational");
        return state.rootCy;
    }

    async function initBehavioralRootCytoscape() {
        var container = state.elements.rootBehavioralCy || document.getElementById("root-behavioral-cy");
        if (!isIndexPage() || !container || !window.cytoscape || !behavioralRootAvailable()) {
            return null;
        }
        if (state.rootBehavioralCy) {
            fitRootCytoscape("behavioral");
            return state.rootBehavioralCy;
        }

        var edgeClickMap = parseJsonAttribute(container, "data-edge-click-map", {});
        var elements = parseJsonAttribute(container, "data-elements", []);

        try {
            state.rootBehavioralCy = window.cytoscape({
                container: container,
                elements: elements,
                style: cytoscapeStyle,
                layout: behavioralRootLayout(),
                minZoom: 0.3,
                maxZoom: 4,
                wheelSensitivity: 0.3,
                autoungrabify: true,
                boxSelectionEnabled: false
            });
        } catch (err) {
            console.error("Behavioral root Cytoscape init failed:", err);
            container.textContent = "Diagram failed to load. Check console.";
            container.style.color = "var(--danger)";
            container.style.padding = "2rem";
            return null;
        }

        container.__edgeClickMap = edgeClickMap;
        storeRevealTargetPositions(state.rootBehavioralCy, snapshotNodePositions(state.rootBehavioralCy));
        bindCytoscapeHighlighting(state.rootBehavioralCy);
        fitRootCytoscape("behavioral");
        return state.rootBehavioralCy;
    }

    function fitRootCytoscape(view) {
        var targetView = view || state.rootView || "organizational";
        var cy = targetView === "behavioral" ? state.rootBehavioralCy : state.rootCy;
        if (!cy || !state.elements.rootStage || state.elements.rootStage.classList.contains("is-hidden")) {
            return;
        }
        window.requestAnimationFrame(function () {
            var activeCy = targetView === "behavioral" ? state.rootBehavioralCy : state.rootCy;
            if (!activeCy || !state.elements.rootStage || state.elements.rootStage.classList.contains("is-hidden")) {
                return;
            }
            fitCytoscapeInstance(activeCy, targetView === "behavioral" ? 60 : 48);
        });
    }

    async function initClusterCytoscape(container) {
        if (!container || !window.cytoscape) {
            return null;
        }
        if (container.__cyInstance) {
            window.requestAnimationFrame(function () {
                if (!container.__cyInstance) {
                    return;
                }
                container.__cyInstance.resize();
                container.__cyInstance.fit(container.__cyInstance.elements(), 48);
            });
            return container.__cyInstance;
        }

        var edgeClickMap = parseJsonAttribute(container, "data-edge-click-map", {});
        var prepared = await prepareDiagramElements(container, "cluster");
        var elements = prepared.elements;

        try {
            container.__cyInstance = window.cytoscape({
                container: container,
                elements: elements,
                style: cytoscapeStyle,
                layout: prepared.hasMermaidLayout ? presetLayout() : getFallbackLayout("cluster"),
                minZoom: 0.3,
                maxZoom: 4,
                wheelSensitivity: 0.3,
                autoungrabify: true,
                boxSelectionEnabled: false
            });
        } catch (err) {
            console.error("Cluster Cytoscape init failed:", err);
            container.textContent = "Diagram failed to load. Check console.";
            container.style.color = "var(--danger)";
            container.style.padding = "2rem";
            return null;
        }

        state.viewportCy = container.__cyInstance;
        storeRevealTargetPositions(container.__cyInstance, snapshotNodePositions(container.__cyInstance));

        container.__cyInstance.on("tap", "node", function (evt) {
            var node = evt.target;
            var nodeId = node.data("id");
            var kind = node.data("kind");
            if (kind === "store") {
                window.storeClick(node.data("storeId"), node.data("label"));
                return;
            }
            if (kind === "system" || kind === "external") {
                window.systemClick(nodeId, node.data("label"));
            }
        });

        container.__cyInstance.on("tap", "edge.system-edge", function (evt) {
            var edge = evt.target;
            var match = edgeClickMap[edge.data("id")] || {
                label: edge.data("label") || "",
                from: edge.data("source") || "",
                to: edge.data("target") || "",
                pages: edge.data("href") ? [edge.data("href")] : []
            };
            openEdgeMatch(match, edge.data("label") || match.label || "");
        });

        bindCytoscapeHighlighting(container.__cyInstance);
        window.requestAnimationFrame(function () {
            if (!container.__cyInstance) {
                return;
            }
            container.__cyInstance.resize();
            container.__cyInstance.fit(container.__cyInstance.elements(), 48);
        });

        return container.__cyInstance;
    }

    function destroyClusterCytoscape(scope) {
        if (!scope) {
            return;
        }
        scope.querySelectorAll(".cy-container[data-level='cluster']").forEach(function (container) {
            if (container.__cyInstance && typeof container.__cyInstance.destroy === "function") {
                container.__cyInstance.destroy();
            }
            container.__cyInstance = null;
        });
        state.viewportCy = null;
    }

    async function initStandaloneSystemCytoscape(scope) {
        if (isIndexPage()) {
            return null;
        }
        var container = (scope || document).querySelector(".cy-container[data-level='system']");
        if (!container) {
            return null;
        }
        return initSystemCytoscape(container);
    }

    async function initSystemCytoscape(container) {
        if (!container || !window.cytoscape) {
            return null;
        }
        if (container.__cyInstance) {
            window.requestAnimationFrame(function () {
                if (!container.__cyInstance) {
                    return;
                }
                container.__cyInstance.resize();
                container.__cyInstance.fit(container.__cyInstance.elements(), 36);
            });
            return container.__cyInstance;
        }

        var targetMap = parseJsonAttribute(container, "data-node-target-map", {});
        var prepared = await prepareDiagramElements(container, "system");
        var elements = prepared.elements;
        container.__nodeTargetMap = targetMap;

        try {
            container.__cyInstance = window.cytoscape({
                container: container,
                elements: elements,
                style: cytoscapeStyle,
                layout: prepared.hasMermaidLayout ? presetLayout() : getFallbackLayout("system"),
                minZoom: 0.2,
                maxZoom: 4,
                wheelSensitivity: 0.25,
                autoungrabify: true,
                boxSelectionEnabled: false
            });
        } catch (err) {
            console.error("System Cytoscape init failed:", err);
            container.textContent = "Diagram failed to load. Check console.";
            container.style.color = "var(--danger)";
            container.style.padding = "2rem";
            return null;
        }

        state.viewportCy = container.__cyInstance;
        storeRevealTargetPositions(container.__cyInstance, snapshotNodePositions(container.__cyInstance));

        container.__cyInstance.on("tap", "node", function (evt) {
            var node = evt.target;
            var nodeId = node.data("id");
            var kind = node.data("kind");
            var systemId = container.dataset.systemId || "";
            var resolvedTarget = resolveDiagramClickTarget(nodeId, systemId, targetMap);
            if (kind === "module-group") {
                return;
            }
            if (kind === "agent" || (resolvedTarget && resolvedTarget.kind === "agent")) {
                window.agentClick(
                    (resolvedTarget && resolvedTarget.id) || nodeId,
                    (resolvedTarget && resolvedTarget.label) || node.data("label")
                );
                return;
            }
            window.moduleClick(
                (resolvedTarget && resolvedTarget.id)
                || node.data("moduleId")
                || resolveModuleClickTarget(nodeId, systemId),
                (resolvedTarget && resolvedTarget.label) || node.data("label")
            );
        });

        bindCytoscapeHighlighting(container.__cyInstance);
        window.requestAnimationFrame(function () {
            if (!container.__cyInstance) {
                return;
            }
            container.__cyInstance.resize();
            container.__cyInstance.fit(container.__cyInstance.elements(), 36);
        });

        return container.__cyInstance;
    }

    function destroySystemCytoscape(scope) {
        if (!scope) {
            return;
        }
        scope.querySelectorAll(".cy-container[data-level='system']").forEach(function (container) {
            if (container.__cyInstance && typeof container.__cyInstance.destroy === "function") {
                container.__cyInstance.destroy();
            }
            container.__cyInstance = null;
        });
        state.viewportCy = null;
    }

    function cacheElements() {
        state.elements.rootLayout = document.querySelector(".root-layout");
        state.elements.rootStage = document.getElementById("root-stage");
        state.elements.rootCy = document.getElementById("root-cy");
        state.elements.rootBehavioralCy = document.getElementById("root-behavioral-cy");
        state.elements.viewport = document.getElementById("diagram-viewport");
        state.elements.backButton = document.getElementById("back-button");
        state.elements.breadcrumb = document.getElementById("breadcrumb");
        state.elements.detailPanel = document.getElementById("detail-panel");
        state.elements.detailPanelTitle = document.getElementById("detail-panel-title");
        state.elements.detailPanelKind = document.getElementById("detail-panel-kind");
        state.elements.detailPanelBody = document.getElementById("detail-panel-body");
        state.elements.detailPanelClose = document.getElementById("detail-panel-close");
        state.elements.detailScrim = document.getElementById("detail-scrim");
        state.elements.viewToggleButtons = Array.from(document.querySelectorAll("[data-view-toggle]"));
    }

    function bindGlobalEvents() {
        const toggleButton = document.querySelector("[data-action='toggle-details']");
        if (toggleButton) {
            toggleButton.addEventListener("click", function () {
                const details = Array.from(document.querySelectorAll("details"));
                const shouldOpen = details.some(function (element) {
                    return !element.open;
                });
                details.forEach(function (element) {
                    element.open = shouldOpen;
                });
                toggleButton.textContent = shouldOpen ? "Collapse All" : "Expand All";
            });
        }

        if (state.elements.viewToggleButtons) {
            state.elements.viewToggleButtons.forEach(function (button) {
                button.addEventListener("click", function () {
                    var nextView = button.getAttribute("data-view-toggle") || "organizational";
                    setRootView(nextView);
                });
            });
        }

        if (state.elements.backButton) {
            state.elements.backButton.addEventListener("click", goBack);
        }

        if (state.elements.breadcrumb) {
            state.elements.breadcrumb.addEventListener("click", function (event) {
                const button = event.target.closest("[data-nav-target]");
                if (!button) {
                    return;
                }
                event.preventDefault();
                const index = Number(button.dataset.navTarget);
                if (!Number.isInteger(index) || index < 0 || index >= state.stack.length) {
                    return;
                }
                applyStack(state.stack.slice(0, index + 1));
            });
        }

        if (state.elements.detailPanelClose) {
            state.elements.detailPanelClose.addEventListener("click", closePanel);
        }

        if (state.elements.detailScrim) {
            state.elements.detailScrim.addEventListener("click", closePanel);
        }

        document.querySelectorAll(".store-card[data-store-id]").forEach(function (card) {
            bindCardActivation(card, function (event) {
                event.preventDefault();
                if (!isIndexPage()) {
                    const anchor = card.querySelector("a[href]");
                    if (anchor) {
                        window.location.href = anchor.href;
                    }
                    return;
                }
                window.storeClick(card.dataset.storeId, compactText(card.textContent));
            });
        });

        if (state.elements.viewport) {
            state.elements.viewport.addEventListener("click", interceptSiteNavigation);
        }

        if (state.elements.detailPanelBody) {
            state.elements.detailPanelBody.addEventListener("click", interceptSiteNavigation);
        }
    }

    function bindCardActivation(element, handler) {
        element.addEventListener("click", handler);
        element.addEventListener("keydown", function (event) {
            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }
            handler(event);
        });
    }

    function interceptSiteNavigation(event) {
        var diagramLink = event.target.closest("[data-open-system-diagram]");
        if (diagramLink) {
            event.preventDefault();
            var systemId = diagramLink.getAttribute("data-system-id");
            var clusterId = diagramLink.getAttribute("data-cluster-id");
            if (isIndexPage() && systemId) {
                openSystemDiagram(systemId, clusterId, systemId, compactText(diagramLink.textContent));
            } else {
                window.location.href = diagramLink.href;
            }
            return;
        }

        const anchor = event.target.closest("a[href]");
        if (!anchor) {
            return;
        }

        let url;
        try {
            url = new URL(anchor.getAttribute("href"), window.location.href);
        } catch (error) {
            return;
        }

        const path = url.pathname;
        const clusterMatch = path.match(/\/clusters\/([^/]+)\.html$/);
        if (clusterMatch && isIndexPage()) {
            event.preventDefault();
            openCluster(clusterMatch[1], "", compactText(anchor.textContent));
            return;
        }

        const systemMatch = path.match(/\/systems\/([^/]+)\.html$/);
        if (systemMatch && isIndexPage()) {
            event.preventDefault();
            window.systemClick(systemMatch[1], compactText(anchor.textContent));
            return;
        }

        const moduleMatch = path.match(/\/modules\/([^/]+)\.html$/);
        if (moduleMatch && isIndexPage()) {
            event.preventDefault();
            window.moduleClick(moduleMatch[1], compactText(anchor.textContent));
            return;
        }

        const agentMatch = path.match(/\/agents\/([^/]+)\.html$/);
        if (agentMatch && isIndexPage()) {
            event.preventDefault();
            window.agentClick(agentMatch[1], compactText(anchor.textContent));
            return;
        }

        const storeMatch = path.match(/\/stores\/([^/]+)\.html$/);
        if (storeMatch && isIndexPage()) {
            event.preventDefault();
            window.storeClick(storeMatch[1], compactText(anchor.textContent));
            return;
        }

        if (isIndexPage() && /\/index\.html$/.test(path)) {
            event.preventDefault();
            applyStack([{ type: "root" }]);
        }
    }

    function openEdgeMatch(match, title) {
        if (!match || !match.pages || match.pages.length === 0 || !isIndexPage()) {
            return;
        }
        if (match.pages.length === 1) {
            setPanelEntry({
                type: "panel",
                kind: "edge",
                id: match.from + "-to-" + match.to,
                url: new URL(match.pages[0], state.baseUrl).href,
                label: title || match.label || (match.from + " to " + match.to),
                parentClusterId: currentClusterId(),
                parentSystemId: currentSystemId()
            });
            return;
        }
        openEdgeListPanel(match, title || match.label || (match.from + " to " + match.to));
    }

    function openEdgeListPanel(match, title) {
        var html = '<div style="padding:1rem"><h3>' + escapeHtml(title) + '</h3>';
        html += '<p style="color:var(--text-dim);margin:0.5rem 0">' + escapeHtml(match.from) + ' \u2192 ' + escapeHtml(match.to) + ' (' + match.pages.length + ' connections)</p><ul>';
        match.pages.forEach(function (href) {
            var name = href.replace("edges/", "").replace(".html", "").replace(/-/g, " ");
            html += '<li><a href="' + href + '">' + escapeHtml(name) + '</a></li>';
        });
        html += "</ul></div>";
        if (state.elements.detailPanelBody) {
            state.elements.detailPanelBody.innerHTML = html;
        }
        state.currentPanelMeta = {
            kind: "edge",
            label: title,
            title: title
        };
        if (state.elements.detailPanelTitle) {
            state.elements.detailPanelTitle.textContent = title;
        }
        if (state.elements.detailPanelKind) {
            state.elements.detailPanelKind.textContent = "Edge";
        }
        if (currentState().type === "panel") {
            state.stack[state.stack.length - 1] = {
                type: "panel",
                kind: "edge-list",
                id: match.from + "-" + match.to,
                title: title,
                label: title,
                parentClusterId: currentClusterId(),
                parentSystemId: currentSystemId()
            };
        } else {
            state.stack.push({
                type: "panel",
                kind: "edge-list",
                id: match.from + "-" + match.to,
                title: title,
                label: title,
                parentClusterId: currentClusterId(),
                parentSystemId: currentSystemId()
            });
        }
        if (state.elements.detailPanel) {
            state.elements.detailPanel.classList.add("is-open");
            state.elements.detailPanel.setAttribute("aria-hidden", "false");
        }
        if (state.elements.detailScrim) {
            state.elements.detailScrim.classList.add("is-visible");
        }
        document.body.classList.add("panel-open");
        updateNavigation();
    }

    function initDetailsToggle(scope) {
        scope.querySelectorAll("details").forEach(function (element) {
            element.addEventListener("toggle", function () {
                const button = document.querySelector("[data-action='toggle-details']");
                if (!button) {
                    return;
                }
                const details = Array.from(document.querySelectorAll("details"));
                const allOpen = details.length > 0 && details.every(function (item) {
                    return item.open;
                });
                button.textContent = allOpen ? "Collapse All" : "Expand All";
            });
        });
    }

    async function setRootView(view, options) {
        if (!isIndexPage()) {
            return null;
        }
        var nextView = view === "behavioral" && behavioralRootAvailable() ? "behavioral" : "organizational";
        state.rootView = nextView;

        document.body.classList.toggle("behavioral-active", nextView === "behavioral");
        if (state.elements.rootStage) {
            state.elements.rootStage.setAttribute("data-active-view", nextView);
        }
        if (Array.isArray(state.elements.viewToggleButtons)) {
            state.elements.viewToggleButtons.forEach(function (button) {
                var buttonView = button.getAttribute("data-view-toggle");
                button.classList.toggle("is-active", buttonView === nextView);
                button.setAttribute("aria-pressed", buttonView === nextView ? "true" : "false");
            });
        }

        if (nextView === "behavioral") {
            await initBehavioralRootCytoscape();
        }

        if (!(options && options.skipRefit)) {
            fitRootCytoscape(nextView);
        }
        return activeRootCy();
    }

    function currentState() {
        return state.stack[state.stack.length - 1];
    }

    function currentClusterId() {
        const current = currentState();
        if (current.type === "cluster") {
            return current.clusterId;
        }
        if (current.type === "system" && current.parentClusterId) {
            return current.parentClusterId;
        }
        if (current.type === "panel" && current.parentClusterId) {
            return current.parentClusterId;
        }
        return null;
    }

    function currentSystemId() {
        const current = currentState();
        if (current.type === "system") {
            return current.systemId;
        }
        if (current.type === "panel" && current.parentSystemId) {
            return current.parentSystemId;
        }
        return null;
    }

    function moduleSystemId(moduleId) {
        const index = String(moduleId).indexOf("-");
        return index === -1 ? "" : String(moduleId).slice(0, index);
    }

    function diagramStateFromStack(stack) {
        const effective = (stack[stack.length - 1] && stack[stack.length - 1].type === "panel")
            ? stack[stack.length - 2]
            : stack[stack.length - 1];
        if (!effective || effective.type === "root") {
            return { type: "root", id: "" };
        }
        if (effective.type === "cluster") {
            return { type: "cluster", id: effective.clusterId };
        }
        if (effective.type === "system") {
            return { type: "system", id: effective.systemId };
        }
        return { type: "root", id: "" };
    }

    function diagramDepth(diagramState) {
        if (!diagramState || diagramState.type === "root") {
            return 0;
        }
        if (diagramState.type === "cluster") {
            return 1;
        }
        if (diagramState.type === "system") {
            return 2;
        }
        return 0;
    }

    function setPendingViewportTransition(nextStack, options) {
        var from = diagramStateFromStack(state.stack);
        var to = diagramStateFromStack(nextStack);
        var fromDepth = diagramDepth(from);
        var toDepth = diagramDepth(to);
        var direction = "neutral";
        if (toDepth > fromDepth) {
            direction = "forward";
        } else if (toDepth < fromDepth) {
            direction = "backward";
        } else if (from.type !== to.type || from.id !== to.id) {
            direction = "forward";
        }
        state.pendingViewportTransition = {
            from: from,
            to: to,
            direction: direction,
            originNodeId: options && options.originNodeId ? options.originNodeId : ""
        };
    }

    function applyStack(nextStack, options) {
        setPendingViewportTransition(nextStack, options);
        state.stack = nextStack;
        updateNavigation();
        renderCurrentState();
    }

    function openCluster(clusterId, originNodeId, label) {
        if (currentClusterId() === clusterId && !currentSystemId() && currentState().type !== "panel") {
            return;
        }
        applyStack(
            [{ type: "root" }, { type: "cluster", clusterId: clusterId, label: label || "" }],
            { originNodeId: originNodeId || clusterId }
        );
    }

    function openSystem(systemId, clusterId, label) {
        setPanelEntry({
            type: "panel",
            kind: "system",
            id: systemId,
            url: resolveSystemUrl(systemId).href,
            parentClusterId: clusterId || currentClusterId(),
            label: label || ""
        });
    }

    function openSystemDiagram(systemId, clusterId, originNodeId, label) {
        const nextStack = [{ type: "root" }];
        if (clusterId) {
            nextStack.push({
                type: "cluster",
                clusterId: clusterId,
                label: state.currentClusterMeta && state.currentClusterMeta.id === clusterId
                    ? state.currentClusterMeta.label
                    : ""
            });
        }
        nextStack.push({
            type: "system",
            systemId: systemId,
            parentClusterId: clusterId || currentClusterId(),
            label: label || ""
        });
        applyStack(nextStack, { originNodeId: originNodeId || systemId });
    }

    function openModule(moduleId, systemId, clusterId, label) {
        const nextSystemId = systemId || moduleSystemId(moduleId);
        const nextClusterId = clusterId || currentClusterId();
        const nextStack = [{ type: "root" }];
        if (nextClusterId) {
            nextStack.push({
                type: "cluster",
                clusterId: nextClusterId,
                label: state.currentClusterMeta && state.currentClusterMeta.id === nextClusterId
                    ? state.currentClusterMeta.label
                    : ""
            });
        }
        if (nextSystemId) {
            nextStack.push({
                type: "system",
                systemId: nextSystemId,
                parentClusterId: nextClusterId,
                label: state.currentSystemMeta && state.currentSystemMeta.id === nextSystemId
                    ? state.currentSystemMeta.label
                    : ""
            });
        }
        setPendingViewportTransition(nextStack, { originNodeId: nextSystemId || moduleId });
        state.stack = nextStack;
        setPanelEntry({
            type: "panel",
            kind: "module",
            id: moduleId,
            url: resolveModuleUrl(moduleId).href,
            parentClusterId: nextClusterId,
            parentSystemId: nextSystemId,
            label: label || ""
        });
    }

    function openAgent(agentId, systemId, clusterId, label) {
        var nextClusterId = clusterId || currentClusterId();
        var nextStack = [{ type: "root" }];
        if (nextClusterId) {
            nextStack.push({
                type: "cluster",
                clusterId: nextClusterId,
                label: state.currentClusterMeta && state.currentClusterMeta.id === nextClusterId
                    ? state.currentClusterMeta.label
                    : ""
            });
        }
        if (systemId) {
            nextStack.push({
                type: "system",
                systemId: systemId,
                parentClusterId: nextClusterId,
                label: state.currentSystemMeta && state.currentSystemMeta.id === systemId
                    ? state.currentSystemMeta.label
                    : ""
            });
        }
        setPendingViewportTransition(nextStack, { originNodeId: systemId || agentId });
        state.stack = nextStack;
        setPanelEntry({
            type: "panel",
            kind: "agent",
            id: agentId,
            url: resolveAgentUrl(agentId).href,
            parentClusterId: nextClusterId,
            parentSystemId: systemId,
            label: label || ""
        });
    }

    function openStore(storeId, label) {
        setPanelEntry({
            type: "panel",
            kind: "store",
            id: storeId,
            url: resolveStoreUrl(storeId).href,
            parentClusterId: currentClusterId(),
            parentSystemId: currentSystemId(),
            label: label || ""
        });
    }

    function setPanelEntry(entry) {
        if (currentState().type === "panel") {
            state.stack[state.stack.length - 1] = entry;
        } else {
            state.stack.push(entry);
        }
        updateNavigation();
        renderCurrentState();
    }

    function closePanel() {
        if (currentState().type !== "panel") {
            return;
        }
        applyStack(state.stack.slice(0, -1));
    }

    function goBack() {
        if (state.stack.length <= 1) {
            return;
        }
        applyStack(state.stack.slice(0, -1));
    }

    async function renderCurrentState() {
        const token = ++state.requestToken;
        const panelState = currentState().type === "panel" ? currentState() : null;
        const clusterId = currentClusterId();
        const systemId = currentSystemId();
        const transition = state.pendingViewportTransition;
        state.pendingViewportTransition = null;

        await renderViewport(clusterId, systemId, token, transition);
        if (token !== state.requestToken) {
            return;
        }

        await renderDetailPanel(panelState, token);
        if (token !== state.requestToken) {
            return;
        }

        updateNavigation();
    }

    function activeDiagramCy() {
        if (state.viewportCy) {
            return state.viewportCy;
        }
        var rootCy = activeRootCy();
        if (rootCy && state.elements.rootStage && !state.elements.rootStage.classList.contains("is-hidden")) {
            return rootCy;
        }
        return null;
    }

    async function transitionOutCurrentDiagram(transition) {
        var currentCy = activeDiagramCy();
        if (!currentCy || !transition || transition.direction === "neutral") {
            return;
        }
        clearCytoscapeHighlighting(currentCy);
        if (transition.direction === "forward") {
            await animateCytoscapeExpandOut(currentCy, transition.originNodeId);
            return;
        }
        await animateCytoscapeContractIn(currentCy);
    }

    async function restoreRootViewport() {
        state.elements.rootStage.classList.remove("is-hidden");
        destroyClusterCytoscape(state.elements.viewport);
        destroySystemCytoscape(state.elements.viewport);
        state.elements.viewport.innerHTML = "";
        state.elements.viewport.classList.remove("is-active");
        await setRootView(state.rootView, { skipRefit: true });
        await nextFrame();
        var rootCy = activeRootCy();
        if (rootCy) {
            var rootPositions = readRevealTargetPositions(rootCy);
            if (!rootPositions || Object.keys(rootPositions).length === 0) {
                rootPositions = snapshotNodePositions(rootCy);
            }
            if (prefersReducedMotion() || !canAnimateCytoscape(rootCy)) {
                finalizeCytoscapeReveal(rootCy, rootPositions);
            } else {
                storeRevealTargetPositions(rootCy, rootPositions);
                await animateCytoscapeRevealIn(rootCy);
            }
            fitCytoscapeInstance(rootCy, state.rootView === "behavioral" ? 60 : 48);
        }
    }

    async function renderViewport(clusterId, systemId, token, transition) {
        if (!state.elements.rootStage || !state.elements.viewport) {
            return;
        }

        var rendered = getRenderedDiagramState();
        var target = { type: "root", id: "" };
        if (systemId) {
            target = { type: "system", id: systemId };
        } else if (clusterId) {
            target = { type: "cluster", id: clusterId };
        }
        if (rendered && rendered.type === target.type && rendered.id === target.id) {
            return;
        }

        if (!clusterId) {
            state.currentClusterMeta = null;
            state.currentSystemMeta = null;
            if (rendered && rendered.type !== "root") {
                await transitionOutCurrentDiagram(transition || { direction: "backward" });
                if (token !== state.requestToken) {
                    return;
                }
                await restoreRootViewport();
            } else {
                state.elements.rootStage.classList.remove("is-hidden");
                state.elements.viewport.innerHTML = "";
                state.elements.viewport.classList.remove("is-active");
                await setRootView(state.rootView, { skipRefit: false });
            }
            state._diagramRendered = true;
            return;
        }

        if (systemId) {
            await renderSystemViewport(clusterId, systemId, token, transition);
            if (token !== state.requestToken) {
                return;
            }
            state._diagramRendered = true;
            return;
        }

        const payload = await fetchPage(resolveClusterUrl(clusterId).href);
        if (token !== state.requestToken) {
            return;
        }

        const wrapper = buildClusterViewportContent(payload, clusterId);
        await showViewportContent(wrapper, token, transition);
        if (token !== state.requestToken) {
            return;
        }

        state.currentClusterMeta = {
            id: payload.entityId || clusterId,
            label: payload.title || clusterId
        };
        state.currentSystemMeta = null;
        state._diagramRendered = true;
    }

    async function renderSystemViewport(clusterId, systemId, token, transition) {
        const payload = await fetchPage(resolveSystemUrl(systemId).href);
        if (token !== state.requestToken) {
            return;
        }

        const wrapper = buildSystemViewportContent(payload, systemId);
        await showViewportContent(wrapper, token, transition);
        if (token !== state.requestToken) {
            return;
        }

        state.currentClusterMeta = {
            id: payload.clusterId || clusterId,
            label: state.currentClusterMeta && state.currentClusterMeta.id === (payload.clusterId || clusterId)
                ? state.currentClusterMeta.label
                : titleCase(payload.clusterId || clusterId || "")
        };
        state.currentSystemMeta = {
            id: payload.entityId || systemId,
            label: payload.title || systemId
        };
    }

    function buildClusterViewportContent(payload, clusterId) {
        return buildDrillDownDiagramContent(
            payload,
            '.cy-container[data-level="cluster"], .cluster-diagram-section .cy-container',
            "cluster-" + clusterId + "-diagram"
        );
    }

    function buildSystemViewportContent(payload, systemId) {
        return buildDrillDownDiagramContent(
            payload,
            '.cy-container[data-level="system"], .system-diagram-section .cy-container',
            "system-" + systemId + "-diagram"
        );
    }

    function buildDrillDownDiagramContent(payload, selector, prefix) {
        const wrapper = document.createElement("section");
        wrapper.className = "drill-down-diagram";

        const diagramNode = payload.article && payload.article.querySelector(selector);
        if (!diagramNode) {
            return wrapper;
        }

        const clone = cloneForInsertion(diagramNode, payload.url, prefix || nextFragmentPrefix());
        wrapper.appendChild(clone);
        return wrapper;
    }

    function getRenderedDiagramState() {
        if (!state._diagramRendered) {
            return null;
        }
        if (state.currentSystemMeta) {
            return { type: "system", id: state.currentSystemMeta.id };
        }
        if (state.currentClusterMeta) {
            return { type: "cluster", id: state.currentClusterMeta.id };
        }
        if (state.elements.rootStage && !state.elements.rootStage.classList.contains("is-hidden")) {
            return { type: "root", id: "" };
        }
        return null;
    }

    async function showViewportContent(wrapper, token, transition) {
        await transitionOutCurrentDiagram(transition);
        if (token !== state.requestToken) {
            return;
        }
        state.elements.rootStage.classList.add("is-hidden");
        destroyClusterCytoscape(state.elements.viewport);
        destroySystemCytoscape(state.elements.viewport);
        state.elements.viewport.innerHTML = "";
        state.elements.viewport.appendChild(wrapper);
        state.elements.viewport.classList.add("is-active");
        var cy = await initializeViewportDiagrams(state.elements.viewport);
        if (token !== state.requestToken) {
            return;
        }
        await nextFrame();
        await animateCytoscapeRevealIn(cy);
    }

    async function initializeViewportDiagrams(scope) {
        if (!scope) {
            return null;
        }
        var activeCy = null;
        var clusterContainers = Array.from(scope.querySelectorAll(".cy-container[data-level='cluster']"));
        for (var i = 0; i < clusterContainers.length; i += 1) {
            activeCy = (await initClusterCytoscape(clusterContainers[i])) || activeCy;
        }
        var systemContainers = Array.from(scope.querySelectorAll(".cy-container[data-level='system']"));
        for (var j = 0; j < systemContainers.length; j += 1) {
            activeCy = (await initSystemCytoscape(systemContainers[j])) || activeCy;
        }
        return activeCy;
    }

    async function renderDetailPanel(entry, token) {
        if (!state.elements.detailPanel || !state.elements.detailPanelBody || !state.elements.detailScrim) {
            return;
        }

        if (!entry) {
            state.currentPanelMeta = null;
            state.elements.detailPanel.classList.remove("is-open");
            state.elements.detailScrim.classList.remove("is-visible");
            state.elements.detailPanel.setAttribute("aria-hidden", "true");
            document.body.classList.remove("panel-open");
            return;
        }

        const payload = await fetchPage(entry.url);
        if (token !== state.requestToken) {
            return;
        }

        state.elements.detailPanelBody.innerHTML = "";
        if (payload.article) {
            state.elements.detailPanelBody.appendChild(
                cloneForInsertion(payload.article, payload.url, "panel-" + entry.kind + "-" + entry.id)
            );
        }

        state.currentPanelMeta = {
            kind: payload.entityKind || entry.kind,
            label: payload.title || entry.label || entry.id || entry.kind || "Detail",
            title: payload.title || entry.label || entry.id || entry.kind || "Detail"
        };
        if (currentState().type === "panel") {
            state.stack[state.stack.length - 1] = Object.assign({}, currentState(), {
                label: state.currentPanelMeta.label
            });
        }

        if (state.elements.detailPanelTitle) {
            state.elements.detailPanelTitle.textContent = state.currentPanelMeta.label;
        }
        if (state.elements.detailPanelKind) {
            state.elements.detailPanelKind.textContent = titleCase(state.currentPanelMeta.kind);
        }

        state.elements.detailPanel.classList.add("is-open");
        state.elements.detailScrim.classList.add("is-visible");
        state.elements.detailPanel.setAttribute("aria-hidden", "false");
        state.elements.detailPanelBody.scrollTop = 0;
        document.body.classList.add("panel-open");
    }

    async function fetchPage(url) {
        const absolute = new URL(url, state.baseUrl).href;
        if (state.pageCache.has(absolute)) {
            return state.pageCache.get(absolute);
        }

        const response = await fetch(absolute);
        if (!response.ok) {
            throw new Error("Failed to fetch " + absolute + " (" + response.status + ")");
        }

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const article = doc.querySelector("article");
        const payload = {
            url: absolute,
            article: article,
            entityKind: article ? article.dataset.entityKind || "" : "",
            entityId: article ? article.dataset.entityId || "" : "",
            clusterId: article ? article.dataset.cluster || "" : "",
            systemId: article ? article.dataset.systemId || article.dataset.entityId || "" : "",
            hasDiagram: !!(
                article && article.querySelector(
                    '.cy-container[data-level="system"]'
                )
            ),
            title: compactText((article && article.querySelector(".page-title")) ? article.querySelector(".page-title").textContent : doc.title)
        };
        state.pageCache.set(absolute, payload);
        return payload;
    }

    function cloneForInsertion(node, baseUrl, prefix) {
        const clone = node.cloneNode(true);
        rebaseUrls(clone, baseUrl);
        namespaceIds(clone, prefix || nextFragmentPrefix());
        return clone;
    }

    function rebaseUrls(root, baseUrl) {
        root.querySelectorAll("[href]").forEach(function (element) {
            const value = element.getAttribute("href");
            if (!value || value.charAt(0) === "#") {
                return;
            }
            element.setAttribute("href", new URL(value, baseUrl).href);
        });
        root.querySelectorAll("[src]").forEach(function (element) {
            const value = element.getAttribute("src");
            if (!value || value.charAt(0) === "#") {
                return;
            }
            element.setAttribute("src", new URL(value, baseUrl).href);
        });
    }

    function namespaceIds(root, prefix) {
        const mapping = new Map();
        root.querySelectorAll("[id]").forEach(function (element) {
            const original = element.id;
            const namespaced = prefix + "-" + original;
            mapping.set(original, namespaced);
            element.id = namespaced;
        });

        ["href", "aria-controls", "aria-labelledby", "aria-describedby", "for"].forEach(function (attribute) {
            root.querySelectorAll("[" + attribute + "]").forEach(function (element) {
                const value = element.getAttribute(attribute);
                if (!value) {
                    return;
                }
                if (attribute === "href" && value.charAt(0) === "#") {
                    const target = value.slice(1);
                    if (mapping.has(target)) {
                        element.setAttribute("href", "#" + mapping.get(target));
                    }
                    return;
                }
                if (mapping.has(value)) {
                    element.setAttribute(attribute, mapping.get(value));
                }
            });
        });
    }

    function updateNavigation() {
        if (state.elements.backButton) {
            state.elements.backButton.disabled = state.stack.length <= 1;
        }

        if (!state.elements.breadcrumb) {
            return;
        }

        const items = [];
        const lastIndex = state.stack.length - 1;

        state.stack.forEach(function (entry, index) {
            if (index > 0) {
                items.push('<span class="breadcrumb-sep sep">›</span>');
            }
            var label = escapeHtml(resolveBreadcrumbLabel(entry, index));
            if (index < lastIndex) {
                items.push(
                    '<button class="breadcrumb-item" type="button" data-stack-index="' +
                    index +
                    '" data-nav-target="' +
                    index +
                    '">' +
                    label +
                    "</button>"
                );
                return;
            }
            items.push('<span class="breadcrumb-current">' + label + "</span>");
        });

        state.elements.breadcrumb.innerHTML = items.join("");
    }

    function resolveBreadcrumbLabel(entry, index) {
        if (!entry || entry.type === "root") {
            return "Overview";
        }
        if (entry.type === "cluster") {
            if (entry.label) {
                return entry.label;
            }
            if (state.currentClusterMeta && state.currentClusterMeta.id === entry.clusterId) {
                return state.currentClusterMeta.label;
            }
            return titleCase(entry.clusterId || "");
        }
        if (entry.type === "system") {
            if (entry.label) {
                return entry.label;
            }
            if (state.currentSystemMeta && state.currentSystemMeta.id === entry.systemId) {
                return state.currentSystemMeta.label;
            }
            return titleCase(entry.systemId || "");
        }
        if (entry.type === "panel") {
            if (entry.label) {
                return entry.label;
            }
            if (state.currentPanelMeta && index === state.stack.length - 1) {
                return state.currentPanelMeta.label || state.currentPanelMeta.title;
            }
            if (entry.title) {
                return entry.title;
            }
            return titleCase(entry.id || entry.kind || "detail");
        }
        return titleCase(entry.type || "");
    }

    function resolveClusterUrl(clusterId) {
        return new URL("clusters/" + clusterId + ".html", state.baseUrl);
    }

    function resolveSystemUrl(systemId) {
        return new URL("systems/" + systemId + ".html", state.baseUrl);
    }

    function resolveModuleUrl(moduleId) {
        return new URL("modules/" + moduleId + ".html", state.baseUrl);
    }

    function resolveAgentUrl(agentId) {
        return new URL("agents/" + agentId + ".html", state.baseUrl);
    }

    function parseNodeTargetMap(container) {
        if (!container) {
            return {};
        }
        if (container.__nodeTargetMap) {
            return container.__nodeTargetMap;
        }
        const raw = container.getAttribute("data-node-target-map")
            || container.getAttribute("data-node-module-map")
            || "{}";
        try {
            const parsed = JSON.parse(raw);
            container.__nodeTargetMap = Object.fromEntries(
                Object.entries(parsed).map(function (entry) {
                    var key = entry[0];
                    var value = entry[1];
                    if (value && typeof value === "object") {
                        return [key, value];
                    }
                    return [key, { kind: "module", id: value }];
                })
            );
        } catch (error) {
            container.__nodeTargetMap = {};
        }
        return container.__nodeTargetMap;
    }

    function parseJsonAttribute(element, name, fallback) {
        if (!element) {
            return fallback;
        }
        var raw = element.getAttribute(name);
        if (!raw) {
            return fallback;
        }
        try {
            return JSON.parse(raw);
        } catch (error) {
            return fallback;
        }
    }

    function activeSystemDiagramContainer(systemId) {
        const candidates = Array.from(
            document.querySelectorAll(
                ".cy-container[data-level='system'][data-system-id]"
            )
        );
        if (systemId) {
            const exact = candidates.find(function (container) {
                return container.dataset.systemId === systemId;
            });
            if (exact) {
                return exact;
            }
        }
        return candidates[0] || null;
    }

    function resolveDiagramClickTarget(nodeId, systemId, targetMap) {
        const value = String(nodeId || "").trim();
        if (!value) {
            return null;
        }
        if (value.indexOf("-") !== -1) {
            return { kind: "module", id: value };
        }
        const mapping = targetMap || parseNodeTargetMap(activeSystemDiagramContainer(systemId || currentSystemId()));
        const target = mapping[value];
        if (!target) {
            return { kind: "module", id: value };
        }
        if (target && typeof target === "object") {
            return target;
        }
        return { kind: "module", id: target };
    }

    function resolveModuleClickTarget(moduleId, systemId) {
        const target = resolveDiagramClickTarget(moduleId, systemId);
        return target && target.kind === "module" ? target.id : "";
    }

    function resolveStoreUrl(storeId) {
        return new URL("stores/" + storeId + ".html", state.baseUrl);
    }

    function nextFragmentPrefix() {
        state.fragmentCounter += 1;
        return "fragment-" + state.fragmentCounter;
    }

    function compactText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function titleCase(value) {
        return compactText(value)
            .split(/[-_:]+/)
            .filter(Boolean)
            .map(function (part) {
                return part.charAt(0).toUpperCase() + part.slice(1);
            })
            .join(" ");
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

})();

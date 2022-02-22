// load zotero api
var script = document.createElement('script');
script.src = "https://unpkg.com/zotero-api-client";
document.head.appendChild(script);

var zoteroApi; // will be set after load
const str_token = '::';

/* get author information */
function get_author(authors) {
	if (typeof authors === 'undefined' || authors.length <= 0)
		return "Unknown author"
	if (authors.length >= 3)
		return authors[0].lastName + " et.al."
	if (authors.length == 2)
		return authors[0].lastName + " & " + authors[1].lastName
	return authors[0].lastName;
}

/* get year information */
function get_year(date) {
	function filter_year(tokens) {
		for (const t of tokens) {
			y = parseInt(t)
			if (!isNaN(y) && y > 50 && y < 10000)
				return t
		}
	}
	if (typeof date === 'undefined' || date == "")
		return "Unknown year"
	return filter_year(date.split(/[-/,]/))
}

/* get details*/
function get_details(collection_name, title) {
	return collection_name + str_token + title
}

/* Retrieve library from Zotero API */
async function retreive(ApiKey, Uid, callback) {
	counter = 1
	drawio_tags = [];
	const myapi = zoteroApi(ApiKey, {
		'limit': 100
	}).library('user', Uid)

	try {
		const collectionsRes = await myapi.collections().get();

		collection_names = {}

		console.log(collectionsRes)
		promises = []

		// Retrieve collection information
		for (const [i, c] of collectionsRes.raw.entries()) {
			console.log(c)
			collection_names[c.key] = c.data.name

			// Add promises to request for the items in collection
			promises.push(new Promise((resolve, reject) => {
				const itemRes = myapi.collections(c.key).items().get()
				resolve(itemRes)
			}))
			console.log(c.data.name)
		}

		// Append the content when the data available
		for (const p of promises) {
			p.then((itemRes) => {
				const items = itemRes.getData()
				items.forEach(item => {
					if (item.itemType != "attachment") {
						console.log(item)
						number = (typeof item.callNumber === 'undefined') ? ('') : (String(item.callNumber))

						item.collections.forEach((ckey) => {
							collection_name = collection_names[ckey]

							// Generate metadata for drawio plugin
							kname = '[' + number + str_token
								+ get_details(collection_name, item.title) + str_token
								+ get_author(item.creators) + " "
								+ get_year(item.date) + str_token
								+ item.key + ']'
							// \u4e00-\u9fa5 is used to match Chinese character
							kname = kname.replace(/[^a-zA-Z0-9/.,&:\]\[\u4e00-\u9fa5]/g, "_")
							drawio_tags.push(kname)
						})
						counter += 1
					}
				})
			})
		}

		// Wait for all promise to finish no matter if it succeeded or rejected
		Promise.allSettled(promises).then((result) => {
			callback(drawio_tags)
		})
	}
	catch (err) {
		console.log(err)
		alert("Error: " + String(err) + '\nPlease check the UID and API key!')
	}
}

function loadZoteroTags(ui) {
	// disable button
	let action = ui.actions.get('reloadZotero');
	action.enabled = false;

	// load from Zotero Api and add them to the list of tags (tags for the root)
	config = JSON.parse(localStorage.getItem(".configuration"));
	zotero_uid = parseInt(config['zotero_uid'], 10);
	zotero_api_key = config['zotero_api_key'];

	graph = ui.editor.graph;
	root = graph.model.getRoot();

	retreive(zotero_api_key, zotero_uid, (citations) => {
		graph.addTagsForCells([root], citations)
		action.enabled = true;
	});
}

function setupZoretoMenu(ui) {
	// Adds resource for action
	mxResources.parse('reloadZotero=Reload Zotero...');

	// Adds action
	ui.actions.addAction('reloadZotero', () => {
		loadZoteroTags(ui);
	});

	// Adds menu item for refreshing
	let menu = ui.menus.get('extras');
	let oldFunct = menu.funct;

	menu.funct = function (menu, parent) {
		oldFunct.apply(this, arguments);
		ui.menus.addMenuItems(menu, ['-', 'reloadZotero'], parent,);
	};
}

var TagSelectorWindow = function (editorUi, x, y, w, h) {
	var graph = editorUi.editor.graph;

	var div = document.createElement('div');
	div.style.overflow = 'hidden';
	div.style.padding = '12px 8px 12px 8px';
	div.style.height = 'auto';

	var filterInput = document.createElement('input');
	filterInput.setAttribute('placeholder', 'Type in the tags and press Enter to add them');
	filterInput.setAttribute('type', 'text');
	filterInput.style.width = '100%';
	filterInput.style.boxSizing = 'border-box';
	filterInput.style.fontSize = '12px';
	filterInput.style.borderRadius = '4px';
	filterInput.style.padding = '4px';
	filterInput.style.marginBottom = '8px';
	filterInput.setAttribute('placeholder', 'Filter tags');
	div.appendChild(filterInput);

	this.window = new mxWindow(mxResources.get('tagSelector'), div, x, y, w, null, true, true);
	this.window.destroyOnClose = false;
	this.window.setMaximizable(false);
	this.window.setResizable(true);
	this.window.setScrollable(true);
	this.window.setClosable(true);
	this.window.contentWrapper.style.overflowY = 'scroll';

	mxEvent.addListener(filterInput, 'keyup', function () {
		// Do something
		console.log('keyup')
	});

	this.window.addListener('show', mxUtils.bind(this, function () {
		this.window.fit();

		if (this.window.isVisible()) {
		}
		else {
			graph.container.focus();
		}
	}));

	this.window.setLocation = function (x, y) {
		var iw = window.innerWidth || document.body.clientWidth || document.documentElement.clientWidth;
		var ih = window.innerHeight || document.body.clientHeight || document.documentElement.clientHeight;

		x = Math.max(0, Math.min(x, iw - this.table.clientWidth));
		y = Math.max(0, Math.min(y, ih - this.table.clientHeight - 48));

		if (this.getX() != x || this.getY() != y) {
			mxWindow.prototype.setLocation.apply(this, arguments);
		}
	};

	var resizeListener = mxUtils.bind(this, function () {
		var x = this.window.getX();
		var y = this.window.getY();

		this.window.setLocation(x, y);
	});

	mxEvent.addListener(window, 'resize', resizeListener);

	this.destroy = function () {
		mxEvent.removeListener(window, 'resize', resizeListener);
		this.window.destroy();
	}
}

function setupTagSelector(ui) {
	// Adds resource for action
	mxResources.parse('tagSelector=Tag Selector');

	// Adds action
	ui.actions.addAction('tagSelector...', () => {
		if (ui.tagSelectorWindow == null) {
			ui.tagSelectorWindow = new TagSelectorWindow(ui, document.body.offsetWidth - 380, 120, 300, 240);
			ui.tagSelectorWindow.window.addListener('show', function () {
				ui.fireEvent(new mxEventObject('tagSelector'));
			});
			ui.tagSelectorWindow.window.addListener('hide', function () {
				ui.fireEvent(new mxEventObject('tagSelector'));
			});
			ui.tagSelectorWindow.window.setVisible(true);
			ui.fireEvent(new mxEventObject('tagSelector'));
		}
		else {
			ui.tagSelectorWindow.window.setVisible(!ui.tagSelectorWindow.window.isVisible());
		}
	});

	// Adds menu item for refreshing
	let menu = ui.menus.get('extras');
	let oldFunct = menu.funct;

	menu.funct = function (menu, parent) {
		oldFunct.apply(this, arguments);
		ui.menus.addMenuItems(menu, ['-', 'tagSelector'], parent);
	};
}

script.onload = () => {
	zoteroApi = ZoteroApiClient.default;
	Draw.loadPlugin(function (ui) {
		setupZoretoMenu(ui);
		setupTagSelector(ui);

		// Adds numbered toggle property
		Editor.commonVertexProperties.push({
			name: 'numbered', dispName: 'Numbered', type: 'bool', defVal: true, isVisible: function (state, format) {
				var graph = format.editorUi.editor.graph;

				return graph.view.redrawNumberShape != null;
			}, onChange: function (graph, newValue) {
				graph.refresh();
			}
		});

		var graph = ui.editor.graph;
		var enabled = true;

		var graphViewResetValidationState = graph.view.resetValidationState;

		graph.view.resetValidationState = function () {
			graphViewResetValidationState.apply(this, arguments);
			this.numberCounter = 0;
		};

		var graphViewValidateCellState = graph.view.validateCellState;

		graph.view.validateCellState = function (cell, recurse) {
			var state = graphViewValidateCellState.apply(this, arguments);
			recurse = (recurse != null) ? recurse : true;

			if (recurse && state != null && graph.model.isVertex(state.cell) &&
				mxUtils.getValue(state.style, 'numbered', 1) == 1) {
				this.numberCounter++;
				this.redrawNumberShape(state);
			}

			return state;
		};

		function citation_pretty_print(token) {
			return token[0] + ': ' + token[3].replace(/[^a-zA-Z0-9/.,&:\]\[]/g, " ") + ']'
		}

		function get_citation_info(tag) {
			token = tag.split('::')
			item = {
				'id': token[0],
				'collection': token[1],
				'title': token[2],
				'citation': citation_pretty_print(token),
				'key': token[4]
			}
			return item
		}

		graph.view.redrawNumberShape = function (state) {
			var numbered = mxUtils.getValue(state.style, 'numbered', 1) == 1;

			// Generate tag item
			citation = ''
			tags = graph.getTagsForCell(state.cell);
			if (tags.length > 0) {
				tags.split(' ').forEach((tag) => {
					info = get_citation_info(tag)
					citation += info.citation + ' \n'
				})
			}

			var value = '<div style="padding:2px;border:1px solid gray;background:yellow;border-radius:2px;">'
				+ citation + '</div>';


			if (enabled && numbered && (citation != '') && graph.model.isVertex(state.cell) &&
				state.shape != null && state.secondLabel == null) {
				state.secondLabel = new mxText(value, new mxRectangle(),
					mxConstants.ALIGN_LEFT, mxConstants.ALIGN_BOTTOM);

				// Styles the label
				state.secondLabel.size = 12;
				state.secondLabel.dialect = mxConstants.DIALECT_STRICTHTML;
				graph.cellRenderer.initializeLabel(state, state.secondLabel);
			}

			if (state.secondLabel != null) {
				if (!numbered) {
					state.secondLabel.destroy();
					state.secondLabel = null;
				}
				else {
					var scale = graph.getView().getScale();
					var bounds = new mxRectangle(state.x + state.width - 4 * scale, state.y + 4 * scale, 0, 0);
					state.secondLabel.value = value;
					state.secondLabel.state = state;
					state.secondLabel.scale = scale;
					state.secondLabel.bounds = bounds;
					state.secondLabel.redraw();
				}
			}
		};

		// Destroys the shape number
		var destroy = graph.cellRenderer.destroy;
		graph.cellRenderer.destroy = function (state) {
			destroy.apply(this, arguments);

			if (state.secondLabel != null) {
				state.secondLabel.destroy();
				state.secondLabel = null;
			}
		};

		graph.cellRenderer.getShapesForState = function (state) {
			return [state.shape, state.text, state.secondLabel, state.control];
		};

		// Extends View menu
		mxResources.parse('number=Number');

		// Adds action
		var action = ui.actions.addAction('number...', function () {
			enabled = !enabled;
			graph.refresh();
		});

		action.setToggleAction(true);
		action.setSelectedCallback(function () { return enabled; });

		var menu = ui.menus.get((urlParams['sketch'] == '1') ? 'extras' : 'view');
		var oldFunct = menu.funct;

		menu.funct = function (menu, parent) {
			oldFunct.apply(this, arguments);

			ui.menus.addMenuItems(menu, ['-', 'number'], parent);
		};

		// Forces refresh if file was loaded before plugin
		if (ui.getCurrentFile() != null) {
			graph.refresh();
		}
	});
};
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
let cW = canvas.width;
let cH = canvas.height;
const worldWidth = 5000;
const worldHeight = 5000;

let currentTool = "pen";
let mouseDown = null;
let lastMouseMove = null;
let startLine = false;
let startPan = false;
let connectedWire = null;
let connectedWireStart = null;
let connectedChip = null;
let connectedChipStart = null;
let wires = [];
let chips = [];

class Position {
	constructor(x = 0, y = 0) {
		this.x = x;
		this.y = y;
	}
	x = 0;
	y = 0;
}

class Point {
	constructor(position = new Position(0, 0)) {
		this.position = position;
	}

	position;

	draw() {
		let pos = worldToViewportPos(this.position);
		ctx.fillStyle = "red";
		ctx.beginPath();
		ctx.ellipse(pos.x, pos.y, 3, 3, 0, 0, 2 * Math.PI);
		ctx.fill();
		ctx.closePath();
	}
}

let currPosition = new Position(0, 0);
let cursor = new Point();

window.addEventListener('resize', resizeCanvas, false);

function resizeCanvas() {
	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;
	cW = canvas.width;
	cH = canvas.height;
	clearCanvas();
	drawCanvas();
}

class Wire {
	constructor(startPosition, endPosition, temp = false) {
		this.temp = temp;
		this.startPositions.push(startPosition);
		this.endPositions.push(endPosition);
	}

	temp;
	startPositions = [];
	endPositions = [];
	state = 0;
	parent = null;
	visible = true;
	inputs = []; //inputs the wire is connected to
	outputs = []; //outputs -||-

	draw() {
		ctx.strokeStyle = (this.state == 1) ? "red" : "rgb(60, 60, 60)";
		ctx.lineWidth = 4;
		this.startPositions.forEach((position, idx) => {
			let start = worldToViewportPos(position);
			let end = worldToViewportPos(this.endPositions[idx]);
			ctx.beginPath();
			ctx.moveTo(start.x, start.y);
			ctx.lineTo(end.x, end.y);
			ctx.closePath();
			ctx.stroke();
		})
	}

	addLine(startPosition, endPosition) {
		this.startPositions.push(startPosition);
		this.endPositions.push(endPosition);
	}

	addInput(input) {
		let x = this.inputs.indexOf(input);
		if (x == -1) {
			this.inputs.push(input);
		}
		input.chip.setInput(input.pinIndex, this.state);
	}

	appendInputs(ins) {
		ins.forEach(i => {
			this.addInput(i);
		})
	}

	addOutput(output) {
		let x = this.outputs.indexOf(output);
		if (x == -1) {
			this.state = output.chip.outputs[output.pinIndex].value;
			this.outputs.push(output);
			output.chip.addOutputWire(this, output.pinIndex);
		}
	}

	appendOutputs(outs) {
		outs.forEach(o => {
			this.addOutput(o);
		})
	}

	addConnection(conn) {
		if (conn == null) {
			return;
		}
		if (conn.type == "input") this.addInput(conn);
		else if (conn.type == "output") this.addOutput(conn);
	}

	setState(value) {
		if (value == this.state) {
			return;
		}
		this.state = value;
		if (this.parent == null) {
			this.inputs.forEach(input => {
				input.chip.setInput(input.pinIndex, this.state);
			});
		}
		else {
			let i = this.parent.outputConnections.findIndex(conn => conn.wire == this);
			if (i > -1) {
				this.parent.setOutput(this.parent.outputConnections[i].outputIndex, this.state);
			}
		}
		drawCanvas();
	}
}

class Pin {
	constructor(value, relativePosition) {
		this.value = value;
		this.relativePosition = relativePosition;
	}

	value = false;
	relativePosition;
}

//method to load instead of this constructor
class Chip {
	constructor(type, name, position, w = [], c = [], i = [], o = [], iC = [], oC = []) {
		this.type = type;
		this.name = name;
		this.position = position;
		this.wires = w;
		this.chips = c;
		this.inputs = i;
		this.outputs = o;
		this.inputConnections = iC;
		this.outputConnections = oC;
		this.size = { w: 30, h: 30 };
		if (type == "and" || type == "not" || type == "or" || type == "xor" || type == "btn") {
			let numOfInputs = (type == "not" ? 1 : 2);
			if (type == "btn") {
				numOfInputs = 0;
			}
			for (let i = 0; i < numOfInputs; ++i) {
				let pos = new Position(-30, (-this.size.h + (i + 1) * this.size.h * 2 / (numOfInputs + 1)));
				this.inputs.push(new Pin(null, pos))
			}
			this.outputs.push(new Pin((type == "btn"), new Position(this.size.w, 0)));
		}
	}

	temp = false;
	type = "";
	name;
	visible = true;
	wires = [];
	chips = [];
	inputs = [];
	outputs = [];
	inputConnections = []; //connect wires to chip inputs {inputIndex, wire}
	outputConnections = []; //connect wires to chip outputs {outputIndex, wire}
	outputWires = []; //{outputIndex, wire}
	position;
	size;
	clickAction = this.calculateDefaultLogic;

	setInput(inputIndex, value) {
		if (this.inputs[inputIndex].value == value && this.inputs[inputIndex].value != null) {
			return;
		}

		if (this.type == "custom") {
			let i = this.inputConnections.findIndex(con => con.inputIndex == inputIndex);

			if (i > -1) {
				this.inputConnections[i].wire.setState(value);
			}
		}
		else {
			this.inputs[inputIndex].value = value;
			this.calculateDefaultLogic();
		}
	}

	setOutput(index, value) {
		this.outputs[index].value = value;
		this.outputWires.forEach(conn => {
			if (conn.outputIndex == index) {
				conn.wire.setState(value);
			}
		})
	}

	addOutputWire(wire, index) {
		let x = this.outputWires.indexOf({ wire: wire, outIndex: index });
		if (x == -1) {
			this.outputWires.push({ wire: wire, outIndex: index });
		}
	}

	calculateDefaultLogic() {
		switch (this.type) {
			case "and":
				this.outputs[0].value = this.inputs[0].value && this.inputs[1].value;
				break;
			case "or":
				this.outputs[0].value = this.inputs[0].value || this.inputs[1].value;
				break;
			case "not":
				this.outputs[0].value = !this.inputs[0].value;
				break;
			case "xor":
				this.outputs[0].value = (this.inputs[0].value || this.inputs[1].value) && !(this.inputs[0].value && this.inputs[1].value);
				break;
			case "btn":
				this.outputs[0].value = !this.outputs[0].value;
				break;
		}

		this.outputWires.forEach(conn => {
			conn.wire.setState(this.outputs[0].value);
		});
	}

	draw() {
		let clPos = worldToViewportPos(this.position);
		ctx.strokeStyle = "white";
		ctx.lineWidth = 2;
		ctx.strokeRect(clPos.x - this.size.w, clPos.y - this.size.h, 2 * this.size.w, 2 * this.size.h);
		ctx.fillStyle = "white";
		ctx.beginPath();
		this.inputs.forEach(input => {
			let pos = worldToViewportPos(new Position(this.position.x + input.relativePosition.x, this.position.y + input.relativePosition.y));
			ctx.ellipse(pos.x, pos.y, 3, 3, 0, 0, 2 * Math.PI);
		});
		ctx.closePath();
		ctx.fill();
		ctx.beginPath();
		this.outputs.forEach(output => {
			let oPos = worldToViewportPos(new Position(this.position.x + output.relativePosition.x, this.position.y + output.relativePosition.y));
			ctx.ellipse(oPos.x, oPos.y, 3, 3, 0, 0, 2 * Math.PI);
		});
		ctx.closePath();
		ctx.fill();
		ctx.font = `${this.size.h / 2}px serif`;
		ctx.fillText(this.name, clPos.x - this.size.w / 2, clPos.y);
	}
}

canvas.addEventListener("mousemove", (event) => {
	let mouseMove = viewportToWorldPos(new Position(event.offsetX, event.offsetY));
	deleteTemporaries();

	if (currentTool == 'hand' && startPan) {
		let move = worldToViewportPos(mouseMove);
		currPosition.x += lastMouseMove.x - move.x;
		currPosition.y += lastMouseMove.y - move.y;
		lastMouseMove = move;
	}

	mouseMove = (checkIfNearSomething(mouseMove));

	connectedWire = null;
	connectedChip = null;


	if (currentTool == 'pen' && startLine) {
		wires.push(new Wire(mouseDown, mouseMove, true));
	}

	if (currentTool.includes("chip")) {
		drawTemporaryChip(currentTool.slice(0, -4), mouseMove);
	}

	cursor.position = mouseMove;
	drawCanvas();
});

canvas.addEventListener("mousedown", (event) => {
	mouseDown = viewportToWorldPos(new Position(event.offsetX, event.offsetY));

	mouseDown = checkIfNearSomething(mouseDown);

	if (currentTool == 'pen') {
		if (connectedWire != null) connectedWireStart = connectedWire;
		if (connectedChip != null) connectedChipStart = connectedChip;
		startLine = true;
	}

	else if (currentTool == 'hand') {
		if (checkIfClick(mouseDown)) return;
		startPan = true;
		lastMouseMove = worldToViewportPos(mouseDown);
	}
	else if (currentTool.includes("chip")) {
		chips.push(new Chip(currentTool.slice(0, -4), currentTool.slice(0, -4), mouseDown));
	}
});

canvas.addEventListener("mouseup", (event) => {
	let mouseUp = viewportToWorldPos(new Position(event.offsetX, event.offsetY));

	deleteTemporaries();

	mouseUp = checkIfNearSomething(mouseUp);

	if (currentTool == 'pen' && startLine) {
		if (connectedWireStart != null && connectedWire == null) {
			connectedWireStart.addLine(mouseDown, mouseUp);
			connectedWireStart.addConnection(connectedChip);
		}
		else if (connectedWire != null && connectedWireStart == null) {
			connectedWire.addLine(mouseDown, mouseUp);
			connectedWire.addConnection(connectedChipStart);
		}
		else if (connectedWire != null && connectedWireStart != null && connectedWire != connectedWireStart) {
			connectedWire.startPositions.forEach((pos, idx) => {
				connectedWireStart.addLine(pos, connectedWire.endPositions[idx]);
			});
			connectedWireStart.addLine(mouseDown, mouseUp);

			connectedWireStart.appendInputs(connectedWire.inputs);

			connectedWireStart.appendOutputs(connectedWire.outputs);

			let i = wires.indexOf(connectedWire);
			if (i > -1) {
				wires.splice(i, 1);
			}
		}
		else if (connectedWire == connectedWireStart && connectedWire != null) {
			connectedWire.addLine(mouseDown, mouseUp);
		}
		else {
			let wire = new Wire(mouseDown, mouseUp);
			wire.addConnection(connectedChip);
			wire.addConnection(connectedChipStart);
			wires.push(wire);
		}
		connectedWire = null;
		connectedWireStart = null;
		connectedChip = null;
		connectedChipStart = null;

		startLine = false;

	}
	if (currentTool == 'hand' && startPan) {
		startPan = false;
	}
});

function drawTemporaryChip(type, position) {
	let c = new Chip(type, type, position);
	c.temp = true;
	chips.push(c);
}

function deleteTemporaries() {
	wires = wires.filter(wire => !wire.temp);
	chips = chips.filter(chip => !chip.temp);
}

function clearCanvas() {
	ctx.clearRect(0, 0, cW, cH);
}

function eraseCanvas() {
	wires = [];
	chips = [];
	ctx.clearRect(0, 0, cW, cH);
}

drawCanvas();

function drawCanvas() {
	clearCanvas();
	wires.forEach(wire => wire.draw());
	chips.forEach(chip => chip.draw());



	//cursor always on top
	cursor.draw();
}

function viewportToWorldPos(position) {
	return new Position(position.x - cW / 2 + currPosition.x, position.y - cH / 2 + currPosition.y);
}

function worldToViewportPos(position) {
	return new Position(cW / 2 + position.x - currPosition.x, cH / 2 + position.y - currPosition.y);
}

function setTool(tool) {
	currentTool = tool;
}

function checkIfClick(position) {
	let mX = position.x, mY = position.y;
	for (let i = 0; i < chips.length; ++i) {
		if (chips[i].type == "btn" && chips[i].id != "") {
			let d = Math.sqrt((mX - chips[i].position.x) * (mX - chips[i].position.x) + (mY - chips[i].position.y) * (mY - chips[i].position.y));
			if (d < 30) {
				chips[i].clickAction();
				return 1
			}
		}
	};
	return 0;
}

function checkIfNearSomething(position) {
	let minDistLine = 20;
	let minDistDot = 30;
	let minDist = 99;
	let mX = position.x, mY = position.y;
	let p, q;
	let resultPos = position;
	wires.forEach(wire => {
		wire.startPositions.forEach((sPos, idx) => {
			let sX = sPos.x, sY = sPos.y;
			let eX = wire.endPositions[idx].x, eY = wire.endPositions[idx].y;

			p = (mY - sY + (eY - sY) / (eX - sX) * sX - (sX - eX) / (eY - sY) * mX) / ((eY - sY) / (eX - sX) - (sX - eX) / (eY - sY));
			q = (sX - eX) / (eY - sY) * (p - mX) + mY;

			let d = Math.sqrt((mX - p) * (mX - p) + (mY - q) * (mY - q));

			let dotDS = Math.sqrt((mX - sX) * (mX - sX) + (mY - sY) * (mY - sY));
			let dotDE = Math.sqrt((mX - eX) * (mX - eX) + (mY - eY) * (mY - eY));

			if (dotDS < minDistDot && dotDS < minDist) {
				minDist = dotDS;
				resultPos = new Position(sX, sY);
				connectedWire = wire
			}

			if (dotDE < minDistDot && dotDE < minDist) {
				minDist = dotDE;
				resultPos = new Position(eX, eY);
				connectedWire = wire
			}

			if (p <= Math.min(sX, eX) || p >= Math.max(sX, eX)) {
				return;
			}

			if (d < minDist) {
				if (d < minDistLine) {
					minDist = d;
					resultPos = new Position(p, q);
					connectedWire = wire
				}
			}
		});
	})
	chips.forEach(chip => {
		chip.outputs.forEach((chipOutput, idx) => {
			let outputWorldPos = new Position(chip.position.x + chipOutput.relativePosition.x, chip.position.y + chipOutput.relativePosition.y);

			let d = Math.sqrt((mX - outputWorldPos.x) * (mX - outputWorldPos.x) + (mY - outputWorldPos.y) * (mY - outputWorldPos.y));

			if (d < minDist && d < minDistDot) {
				resultPos = outputWorldPos;
				minDist = d;
				connectedChip = { chip: chip, pinIndex: idx, type: "output" };
				connectedWire = null;
			}
		})
		chip.inputs.forEach((input, idx) => {
			let inputWorldPos = new Position(chip.position.x + input.relativePosition.x, chip.position.y + input.relativePosition.y);

			let d = Math.sqrt((mX - inputWorldPos.x) * (mX - inputWorldPos.x) + (mY - inputWorldPos.y) * (mY - inputWorldPos.y));

			if (d < minDist && d < minDistDot) {
				resultPos = inputWorldPos;
				minDist = d;
				connectedChip = { chip: chip, pinIndex: idx, type: "input" };
				connectedWire = null;
			}
		})
	});
	return resultPos;
}
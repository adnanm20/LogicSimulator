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
let connectedWireIndex = -1;
let wireEndConected = -1;
let wireStartConected = -1;
let connectedGatePin = null;
let wireStartGateConnected = null;
let connectedGateOutput = null;
let wires = [];
let gates = [];

window.addEventListener('resize', resizeCanvas, false);
		
function resizeCanvas() {
	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;
	let cW = canvas.width;
	let cH = canvas.height;
	clearCanvas();
	drawCanvas();
}

class Position {
	constructor(x = 0, y = 0)
	{
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

class Wire {
	constructor(id, startPosition, endPosition) {
		this.id = id;
		this.startPositions.push(startPosition);
		this.endPositions.push(endPosition);
	}
	
	id = "";
	startPositions = [];
	endPositions = [];
	state = 0;
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
		let x = this.inputs.findIndex(i => i.id == input.id && i.pinIndex == input.pinIndex);
		if(x == -1)
		{
			this.inputs.push(input);
		}
		let idx = gates.findIndex(gate => gate.id == input.id);
		if(idx > -1)
		{
			gates[idx].setInput(input.pinIndex, this.state);
			console.log(idx);
		}
	}

	appendInputs(ins) {
		ins.forEach(i => {
			this.addInput(i);
		})
	}

	addOutput(output) {
		let x = this.outputs.findIndex(i => i.id == output.id && i.pinIndex == output.pinIndex);
		if(x == -1)
		{
			this.outputs.push(output);
		}
	}

	appendOutputs(outs) {
		outs.forEach(o => {
			this.addOutput(o);
		})
	}

	setState(value) {
		if(value == this.state)
		{
			return;
		}
		this.state = value;
		this.inputs.forEach(input => {
			let idx = gates.findIndex(gate => gate.id == input.id);
			if(idx > -1)
			{
				gates[idx].setInput(input.pinIndex, this.state);
			}
		});
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

class Gate {
	constructor(id, type, position, size = {w: 30, h: 30}) {
		this.id = id;
		let numOfInputs = (type == "not" ? 1 : 2);
		for(let i = 0; i < numOfInputs; ++i)
		{
			let pos = new Position(-30, (-size.h + (i+1) * size.h*2/(numOfInputs+1)));
			this.inputs.push(new Pin(null, pos))
		}
		this.type = type;
		this.position = position;
		this.size = size;
		this.output = new Pin(null, new Position(size.w, 0));
		this.calculate();
	}

	id = "";
	inputs = [];
	output;
	type = "";
	position = new Position();
	size;

	draw() {
		let clPos = worldToViewportPos(this.position);
		ctx.strokeStyle = "white";
		ctx.lineWidth = 2;
		ctx.strokeRect(clPos.x - this.size.w, clPos.y - this.size.h, 2 * this.size.w, 2 * this.size.h);
		ctx.fillStyle = "white";
		this.inputs.forEach(input => {
			let pos = worldToViewportPos(new Position(this.position.x + input.relativePosition.x, this.position.y + input.relativePosition.y));
			ctx.ellipse(pos.x, pos.y, 3, 3, 0, 0, 2 * Math.PI);
			ctx.closePath();
			ctx.fill();
		});
		let oPos = worldToViewportPos(new Position(this.position.x + this.output.relativePosition.x, this.position.y + this.output.relativePosition.y));
		ctx.ellipse(oPos.x, oPos.y, 3, 3, 0, 0, 2 * Math.PI);
		ctx.closePath();
		ctx.fill();
		ctx.font = `${this.size.h/2}px serif`;
		ctx.fillText(this.type, clPos.x - this.size.w/2, clPos.y);
	}

	setInput(index, value) {
		if(this.inputs[index].value == value && this.inputs[index].value != null)
		{
			console.log(this.inputs[index].value);
			return;
		}
		this.inputs[index].value = value;
		this.calculate();
		//foreach output of gate/chip
		wires.forEach(wire => {
			let i = wire.outputs.findIndex(out => (out.id == this.id));
			if(i > -1)
			{
				wire.setState(this.output.value);
			}
		});
	}
	calculate() {
		switch(this.type) {
			case "and":
				this.output.value = this.inputs[0].value && this.inputs[1].value;
				break;
			case "or":
				this.output.value = this.inputs[0].value || this.inputs[1].value;
				break;
			case "not":
				this.output.value = !this.inputs[0].value;
				break;
			case "xor":
				this.output.value = (this.inputs[0].value || this.inputs[1].value) && !(this.inputs[0].value && this.inputs[1].value);
				break;
		}
	}

}

let currPosition = new Position(0, 0);
let cursor = new Point();

canvas.addEventListener("mousemove", (event) => {
	let mouseMove = viewportToWorldPos(new Position(event.offsetX, event.offsetY));
	deleteTemporaries();

	mouseMove = (checkIfNearSomething(mouseMove));

	connectedWireIndex = -1;
	connectedGatePin = null;
	
	if(currentTool == 'pen' && startLine)
	{		
		wires.push(new Wire("", mouseDown, mouseMove));
	}

	if(currentTool == 'hand' && startPan)
	{
		let move = worldToViewportPos(mouseMove);
		currPosition.x += lastMouseMove.x - move.x;
		currPosition.y += lastMouseMove.y - move.y;
		lastMouseMove = move;
	}

	if(currentTool.includes("gate"))
	{
		drawTemporaryGate(currentTool.slice(0, -4), mouseMove);
	}
	
	cursor.position = mouseMove;
	drawCanvas();
});

canvas.addEventListener("mousedown", (event) => {
	mouseDown = viewportToWorldPos(new Position(event.offsetX, event.offsetY));

	mouseDown = checkIfNearSomething(mouseDown);
	
	if(currentTool == 'pen') {
		if(connectedWireIndex > -1) wireStartConected = connectedWireIndex;
		if(connectedGatePin != null) wireStartGateConnected = connectedGatePin;
		startLine = true;
	}
	else if(currentTool == 'hand')
	{
		startPan = true;
		lastMouseMove = worldToViewportPos(mouseDown);
	}
	else if(currentTool.includes("gate")) {
		gates.push(new Gate(getRandomId(5), currentTool.slice(0, -4), mouseDown));
	}
});

canvas.addEventListener("mouseup", (event) => {
	let mouseUp = viewportToWorldPos(new Position(event.offsetX, event.offsetY));

	deleteTemporaries();
	
	mouseUp = checkIfNearSomething(mouseUp);

	if(currentTool == 'pen' && startLine)
	{
		if(connectedWireIndex > -1)
		{
			wireEndConected = connectedWireIndex;
		}

		if((wireStartConected > -1) || (wireEndConected > -1))
		{
			if(wireEndConected > -1 && (wireStartConected == -1 || wireEndConected == wireStartConected))
			{
				wires[wireEndConected].addLine(mouseDown, mouseUp);
				if(connectedGatePin != null)
				{
					if(connectedGatePin.type == "input")
					{
						wires[wireEndConected].addInput(connectedGatePin);
					}
					else
					{
						wires[wireEndConected].addOutput(connectedGatePin);
					}
				}
				if(wireStartGateConnected != null)
				{
					if(wireStartGateConnected.type == "input")
					{
						wires[wireEndConected].addInput(wireStartGateConnected);
					}
					else
					{
						wires[wireEndConected].addOutput(wireStartGateConnected);
					}
				}
				connectedGatePin = null;
				wireStartGateConnected = null;
				wireEndConected = -1;
				wireStartConected = -1;
			}
			else if(wireStartConected > -1 && (wireEndConected == -1 || wireEndConected == wireStartConected))
			{
				wires[wireStartConected].addLine(mouseDown, mouseUp);
				if(connectedGatePin != null)
				{
					if(connectedGatePin.type == "input")
					{
						wires[wireStartConected].addInput(connectedGatePin);
					}
					else
					{
						wires[wireStartConected].addOutput(connectedGatePin);
					}
				}
				if(wireStartGateConnected != null)
				{
					if(wireStartGateConnected.type == "input")
					{
						wires[wireStartConected].addInput(wireStartGateConnected);
					}
					else
					{
						wires[wireStartConected].addOutput(wireStartGateConnected);
					}
				}
				connectedGatePin = null;
				wireStartGateConnected = null;
				wireEndConected = -1;
				wireStartConected = -1;
			}
			else if((wireStartConected > -1) && (wireEndConected > -1) && (wireStartConected != wireEndConected))
			{
				wires[wireEndConected].startPositions.forEach((pos, idx) => {
					wires[wireStartConected].addLine(pos, wires[wireEndConected].endPositions[idx]);
				});

				wires[wireStartConected].appendInputs(wires[wireEndConected].inputs);

				wires[wireStartConected].appendOutputs(wires[wireEndConected].outputs);

				wires[wireStartConected].addLine(mouseDown, mouseUp);
				
				if(connectedGatePin != null)
				{
					if(connectedGatePin.type == "input")
					{
						wires[wireStartConected].addInput(connectedGatePin);
					}
					else
					{
						wires[wireStartConected].addOutput(connectedGatePin);
					}
				}
				if(wireStartGateConnected != null)
				{
					if(wireStartGateConnected.type == "input")
					{
						wires[wireStartConected].addInput(wireStartGateConnected);
					}
					else
					{
						wires[wireStartConected].addOutput(wireStartGateConnected);
					}
				}
				connectedGatePin = null;
				wireStartGateConnected = null;
				
				wires.splice(wireEndConected, 1);
			}
		}
		else
		{
			let wire = new Wire(getRandomId(5), mouseDown, mouseUp);
			if(connectedGatePin != null)
			{
				if(connectedGatePin.type == "input")
				{
					wire.addInput(connectedGatePin);
				}
				else
				{
					wire.addOutput(connectedGatePin);
				}
			}
			if(wireStartGateConnected != null)
			{
				if(wireStartGateConnected.type == "input")
				{
					wire.addInput(wireStartGateConnected);
				}
				else
				{
					wire.addOutput(wireStartGateConnected);
				}
			}
			connectedGatePin = null;
			wireStartGateConnected = null;
			wires.push(wire);
		}
		startLine = false;
	}
	if(currentTool == 'hand' && startPan)
	{
		startPan = false;
	}
});

function drawTemporaryGate(type, position) {
	gates.push(new Gate("", type, position));
}

function deleteTemporaries() {
	wires = wires.filter(line => line.id != "");
	gates = gates.filter(gate => gate.id != "");
}

function clearCanvas() {
	ctx.clearRect(0, 0, cW, cH);
}

drawCanvas();

function drawCanvas() {
	clearCanvas();
	wires.forEach(line => line.draw());
	gates.forEach(gate => gate.draw());



	//cursor always on top
	cursor.draw();
}

function viewportToWorldPos(position) {
	return new Position(position.x - cW/2 + currPosition.x, position.y - cH/2 + currPosition.y);
}

function worldToViewportPos(position) {
	return new Position(cW/2 + position.x - currPosition.x, cH/2 + position.y - currPosition.y);
}

function setTool(tool) {
	currentTool = tool;
}

function getRandomId(length) {
	letters = "abcdefghijklmnopqrstuvwxyz1234567890";
	id = "";
	for(let i = 0; i < length; i++)
	{
		id = id + letters[Math.floor(Math.random() * letters.length)];
	}
	return id;
}

function checkIfNearSomething(position) {
	let minDistLine = 20;
	let minDistDot = 30;
	let minDist = 99;
	let mX = position.x, mY = position.y;
	let p, q;
	let resultPos = position;
	wires.forEach((wire, wireIndex) => {
		wire.startPositions.forEach((sPos, idx) => {
			let sX = sPos.x, sY = sPos.y;
			let eX = wire.endPositions[idx].x, eY = wire.endPositions[idx].y;

			p = (mY - sY + (eY-sY)/(eX-sX) * sX - (sX-eX)/(eY-sY) * mX)/((eY-sY)/(eX-sX) - (sX-eX)/(eY-sY));
			q = (sX-eX)/(eY-sY) * (p - mX) + mY;

			let d = Math.sqrt((mX-p)*(mX-p) + (mY-q)*(mY-q));

			let dotDS = Math.sqrt((mX-sX)*(mX-sX) + (mY-sY)*(mY-sY));
			let dotDE = Math.sqrt((mX-eX)*(mX-eX) + (mY-eY)*(mY-eY));
			
			if(dotDS < minDistDot && dotDS < minDist)
			{
				minDist = dotDS;
				resultPos = new Position(sX, sY);
				connectedWireIndex = wireIndex;
			}
			
			if(dotDE < minDistDot && dotDE < minDist)
			{
				minDist = dotDE;
				resultPos = new Position(eX, eY);
				connectedWireIndex = wireIndex;
			}
			
			
			if(p <= Math.min(sX, eX) || p >= Math.max(sX, eX))
			{
				return;
			}

			if(d < minDist)
			{
				if(d < minDistLine)
				{
					minDist = d;
					resultPos = new Position(p, q);
					connectedWireIndex = wireIndex;
				}	
			}	
		});	
	})
	gates.forEach(gate => {
		let outputWorldPos = new Position(gate.position.x + gate.output.relativePosition.x, gate.position.y + gate.output.relativePosition.y);

		let d = Math.sqrt((mX-outputWorldPos.x)*(mX-outputWorldPos.x) + (mY-outputWorldPos.y)*(mY-outputWorldPos.y));

		if(d < minDist && d < minDistDot)
		{
			resultPos = outputWorldPos;
			minDist = d;
			connectedGatePin = {id: gate.id, pinIndex: 0, type: "output"};
			connectedWireIndex = -1;
		}
		gate.inputs.forEach((input, idx) => {
			let inputWorldPos = new Position(gate.position.x + input.relativePosition.x, gate.position.y + input.relativePosition.y);

			let d = Math.sqrt((mX-inputWorldPos.x)*(mX-inputWorldPos.x) + (mY-inputWorldPos.y)*(mY-inputWorldPos.y));

			if(d < minDist && d < minDistDot)
			{
				resultPos = inputWorldPos;
				minDist = d;
				connectedGatePin = {id: gate.id, pinIndex: idx, type: "input"};
				connectedWireIndex = -1;
			}
		})
	});
	return resultPos;
}
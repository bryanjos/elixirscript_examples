/* @flow */

class Mailbox {
  constructor() {
    this.messages = [];
  }

  deliver(message) {
    this.messages.push(message);
    return message;
  }

  get() {
    return this.messages;
  }

  isEmpty() {
    return this.messages.length === 0;
  }

  removeAt(index) {
    this.messages.splice(index, 1);
  }
}

var States = {
  NORMAL: Symbol.for("normal"),
  KILL: Symbol.for("kill"),
  SUSPEND: Symbol.for("suspend"),
  CONTINUE: Symbol.for("continue"),
  RECEIVE: Symbol.for("receive"),
  SEND: Symbol.for("send"),
  SLEEPING: Symbol.for("sleeping"),
  RUNNING: Symbol.for("running"),
  SUSPENDED: Symbol.for("suspended"),
  STOPPED: Symbol.for("stopped"),
  SLEEP: Symbol.for("sleep"),
  EXIT: Symbol.for("exit"),
  NOMATCH: Symbol.for("no_match")
};

function is_sleep(value) {
  return Array.isArray(value) && value[0] === States.SLEEP;
}

function is_receive(value) {
  return Array.isArray(value) && value[0] === States.RECEIVE;
}

function receive_timed_out(value) {
  return value[2] != null && value[2] < Date.now();
}

class Process {
  constructor(pid, func, args, mailbox, system) {
    this.pid = pid;
    this.func = func;
    this.args = args;
    this.mailbox = mailbox;
    this.system = system;
    this.status = States.STOPPED;
    this.dict = {};
    this.flags = {};
    this.monitors = [];
  }

  start() {
    const function_scope = this;
    let machine = this.main();

    this.system.schedule(function () {
      function_scope.system.set_current(function_scope.pid);
      function_scope.run(machine, machine.next());
    }, this.pid);
  }

  *main() {
    let retval = States.NORMAL;

    try {
      yield* this.func.apply(null, this.args);
    } catch (e) {
      console.error(e);
      retval = e;
    }

    this.system.exit(retval);
  }

  process_flag(flag, value) {
    const old_value = this.flags[flag];
    this.flags[flag] = value;
    return old_value;
  }

  is_trapping_exits() {
    return this.flags[Symbol.for("trap_exit")] && this.flags[Symbol.for("trap_exit")] == true;
  }

  signal(reason) {
    if (reason !== States.NORMAL) {
      console.error(reason);
    }

    this.system.remove_proc(this.pid, reason);
  }

  receive(fun) {
    let value = States.NOMATCH;
    let messages = this.mailbox.get();

    for (let i = 0; i < messages.length; i++) {
      try {
        value = fun(messages[i]);
        if (value !== States.NOMATCH) {
          this.mailbox.removeAt(i);
          break;
        }
      } catch (e) {
        if (e.constructor.name != "MatchError") {
          this.exit(e);
        }
      }
    }

    return value;
  }

  run(machine, step) {
    const function_scope = this;

    if (!step.done) {
      let value = step.value;

      if (is_sleep(value)) {

        this.system.delay(function () {
          function_scope.system.set_current(function_scope.pid);
          function_scope.run(machine, machine.next());
        }, value[1]);
      } else if (is_receive(value) && receive_timed_out(value)) {

        let result = value[3]();

        this.system.schedule(function () {
          function_scope.system.set_current(function_scope.pid);
          function_scope.run(machine, machine.next(result));
        });
      } else if (is_receive(value)) {

        let result = function_scope.receive(value[1]);

        if (result === States.NOMATCH) {
          this.system.suspend(function () {
            function_scope.system.set_current(function_scope.pid);
            function_scope.run(machine, step);
          });
        } else {
          this.system.schedule(function () {
            function_scope.system.set_current(function_scope.pid);
            function_scope.run(machine, machine.next(result));
          });
        }
      } else {
        this.system.schedule(function () {
          function_scope.system.set_current(function_scope.pid);
          function_scope.run(machine, machine.next(value));
        });
      }
    }
  }
}

class ProcessQueue {
  constructor(pid) {
    this.pid = pid;
    this.tasks = [];
  }

  empty() {
    return this.tasks.length === 0;
  }

  add(task) {
    this.tasks.push(task);
  }

  next() {
    return this.tasks.shift();
  }
}

class Scheduler {
  constructor(throttle = 0, reductions_per_process = 8) {
    this.isRunning = false;
    this.invokeLater = function (callback) {
      setTimeout(callback, throttle);
    };

    // In our case a reduction is equal to a task call
    // Controls how many tasks are called at a time per process
    this.reductions_per_process = reductions_per_process;
    this.queues = new Map();
    this.run();
  }

  addToQueue(pid, task) {
    if (!this.queues.has(pid)) {
      this.queues.set(pid, new ProcessQueue(pid));
    }

    this.queues.get(pid).add(task);
  }

  removePid(pid) {
    this.isRunning = true;

    this.queues.delete(pid);

    this.isRunning = false;
  }

  run() {
    if (this.isRunning) {
      this.invokeLater(() => {
        this.run();
      });
    } else {
      for (let [pid, queue] of this.queues) {
        let reductions = 0;
        while (queue && !queue.empty() && reductions < this.reductions_per_process) {
          let task = queue.next();
          this.isRunning = true;

          let result;

          try {
            result = task();
          } catch (e) {
            console.error(e);
            result = e;
          }

          this.isRunning = false;

          if (result instanceof Error) {
            throw result;
          }

          reductions++;
        }
      }

      this.invokeLater(() => {
        this.run();
      });
    }
  }

  addToScheduler(pid, task, dueTime = 0) {
    if (dueTime === 0) {
      this.invokeLater(() => {
        this.addToQueue(pid, task);
      });
    } else {
      setTimeout(() => {
        this.addToQueue(pid, task);
      }, dueTime);
    }
  }

  schedule(pid, task) {
    this.addToScheduler(pid, () => {
      task();
    });
  }

  scheduleFuture(pid, dueTime, task) {
    this.addToScheduler(pid, () => {
      task();
    }, dueTime);
  }
}

class Tuple$1 {

  constructor(...args) {
    this.values = Object.freeze(args);
    this.length = this.values.length;
  }

  get(index) {
    return this.values[index];
  }

  count() {
    return this.values.length;
  }

  [Symbol.iterator]() {
    return this.values[Symbol.iterator]();
  }

  toString() {
    var i,
        s = "";
    for (i = 0; i < this.values.length; i++) {
      if (s !== "") {
        s += ", ";
      }
      s += this.values[i].toString();
    }

    return "{" + s + "}";
  }

  put_elem(index, elem) {
    if (index === this.length) {
      let new_values = this.values.concat([elem]);
      return new Tuple$1(...new_values);
    }

    let new_values = this.values.concat([]);
    new_values.splice(index, 0, elem);
    return new Tuple$1(...new_values);
  }

  remove_elem(index) {
    let new_values = this.values.concat([]);
    new_values.splice(index, 1);
    return new Tuple$1(...new_values);
  }

}

let process_counter = -1;

class PID {
  constructor() {
    process_counter = process_counter + 1;
    this.id = process_counter;
  }

  toString() {
    return "PID#<0." + this.id + ".0>";
  }
}

let ref_counter = -1;

class Reference {
  constructor() {
    ref_counter = ref_counter + 1;
    this.id = ref_counter;
    this.ref = Symbol();
  }

  toString() {
    return "Ref#<0.0.0." + this.id + ">";
  }
}

class BitString {
  constructor(...args) {
    this.value = Object.freeze(this.process(args));
    this.length = this.value.length;
    this.bit_size = this.length * 8;
    this.byte_size = this.length;
  }

  get(index) {
    return this.value[index];
  }

  count() {
    return this.value.length;
  }

  slice(start, end = null) {
    let s = this.value.slice(start, end);
    let ms = s.map(elem => BitString.integer(elem));
    return new BitString(...ms);
  }

  [Symbol.iterator]() {
    return this.value[Symbol.iterator]();
  }

  toString() {
    var i,
        s = "";
    for (i = 0; i < this.count(); i++) {
      if (s !== "") {
        s += ", ";
      }
      s += this.get(i).toString();
    }

    return "<<" + s + ">>";
  }

  process(bitStringParts) {
    let processed_values = [];

    var i;
    for (i = 0; i < bitStringParts.length; i++) {
      let processed_value = this['process_' + bitStringParts[i].type](bitStringParts[i]);

      for (let attr of bitStringParts[i].attributes) {
        processed_value = this['process_' + attr](processed_value);
      }

      processed_values = processed_values.concat(processed_value);
    }

    return processed_values;
  }

  process_integer(value) {
    return value.value;
  }

  process_float(value) {
    if (value.size === 64) {
      return BitString.float64ToBytes(value.value);
    } else if (value.size === 32) {
      return BitString.float32ToBytes(value.value);
    }

    throw new Error('Invalid size for float');
  }

  process_bitstring(value) {
    return value.value.value;
  }

  process_binary(value) {
    return BitString.toUTF8Array(value.value);
  }

  process_utf8(value) {
    return BitString.toUTF8Array(value.value);
  }

  process_utf16(value) {
    return BitString.toUTF16Array(value.value);
  }

  process_utf32(value) {
    return BitString.toUTF32Array(value.value);
  }

  process_signed(value) {
    return new Uint8Array([value])[0];
  }

  process_unsigned(value) {
    return value;
  }

  process_native(value) {
    return value;
  }

  process_big(value) {
    return value;
  }

  process_little(value) {
    return value.reverse();
  }

  process_size(value) {
    return value;
  }

  process_unit(value) {
    return value;
  }

  static integer(value) {
    return BitString.wrap(value, { 'type': 'integer', 'unit': 1, 'size': 8 });
  }

  static float(value) {
    return BitString.wrap(value, { 'type': 'float', 'unit': 1, 'size': 64 });
  }

  static bitstring(value) {
    return BitString.wrap(value, { 'type': 'bitstring', 'unit': 1, 'size': value.bit_size });
  }

  static bits(value) {
    return BitString.bitstring(value);
  }

  static binary(value) {
    return BitString.wrap(value, { 'type': 'binary', 'unit': 8, 'size': value.length });
  }

  static bytes(value) {
    return BitString.binary(value);
  }

  static utf8(value) {
    return BitString.wrap(value, { 'type': 'utf8', 'unit': 1, 'size': value.length });
  }

  static utf16(value) {
    return BitString.wrap(value, { 'type': 'utf16', 'unit': 1, 'size': value.length * 2 });
  }

  static utf32(value) {
    return BitString.wrap(value, { 'type': 'utf32', 'unit': 1, 'size': value.length * 4 });
  }

  static signed(value) {
    return BitString.wrap(value, {}, 'signed');
  }

  static unsigned(value) {
    return BitString.wrap(value, {}, 'unsigned');
  }

  static native(value) {
    return BitString.wrap(value, {}, 'native');
  }

  static big(value) {
    return BitString.wrap(value, {}, 'big');
  }

  static little(value) {
    return BitString.wrap(value, {}, 'little');
  }

  static size(value, count) {
    return BitString.wrap(value, { 'size': count });
  }

  static unit(value, count) {
    return BitString.wrap(value, { 'unit': count });
  }

  static wrap(value, opt, new_attribute = null) {
    let the_value = value;

    if (!(value instanceof Object)) {
      the_value = { 'value': value, 'attributes': [] };
    }

    the_value = Object.assign(the_value, opt);

    if (new_attribute) {
      the_value.attributes.push(new_attribute);
    }

    return the_value;
  }

  static toUTF8Array(str) {
    var utf8 = [];
    for (var i = 0; i < str.length; i++) {
      var charcode = str.charCodeAt(i);
      if (charcode < 0x80) {
        utf8.push(charcode);
      } else if (charcode < 0x800) {
        utf8.push(0xc0 | charcode >> 6, 0x80 | charcode & 0x3f);
      } else if (charcode < 0xd800 || charcode >= 0xe000) {
        utf8.push(0xe0 | charcode >> 12, 0x80 | charcode >> 6 & 0x3f, 0x80 | charcode & 0x3f);
      }
      // surrogate pair
      else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + ((charcode & 0x3ff) << 10 | str.charCodeAt(i) & 0x3ff);
          utf8.push(0xf0 | charcode >> 18, 0x80 | charcode >> 12 & 0x3f, 0x80 | charcode >> 6 & 0x3f, 0x80 | charcode & 0x3f);
        }
    }
    return utf8;
  }

  static toUTF16Array(str) {
    var utf16 = [];
    for (var i = 0; i < str.length; i++) {
      var codePoint = str.codePointAt(i);

      if (codePoint <= 255) {
        utf16.push(0);
        utf16.push(codePoint);
      } else {
        utf16.push(codePoint >> 8 & 0xFF);
        utf16.push(codePoint & 0xFF);
      }
    }
    return utf16;
  }

  static toUTF32Array(str) {
    var utf32 = [];
    for (var i = 0; i < str.length; i++) {
      var codePoint = str.codePointAt(i);

      if (codePoint <= 255) {
        utf32.push(0);
        utf32.push(0);
        utf32.push(0);
        utf32.push(codePoint);
      } else {
        utf32.push(0);
        utf32.push(0);
        utf32.push(codePoint >> 8 & 0xFF);
        utf32.push(codePoint & 0xFF);
      }
    }
    return utf32;
  }

  //http://stackoverflow.com/questions/2003493/javascript-float-from-to-bits
  static float32ToBytes(f) {
    var bytes = [];

    var buf = new ArrayBuffer(4);
    new Float32Array(buf)[0] = f;

    let intVersion = new Uint32Array(buf)[0];

    bytes.push(intVersion >> 24 & 0xFF);
    bytes.push(intVersion >> 16 & 0xFF);
    bytes.push(intVersion >> 8 & 0xFF);
    bytes.push(intVersion & 0xFF);

    return bytes;
  }

  static float64ToBytes(f) {
    var bytes = [];

    var buf = new ArrayBuffer(8);
    new Float64Array(buf)[0] = f;

    var intVersion1 = new Uint32Array(buf)[0];
    var intVersion2 = new Uint32Array(buf)[1];

    bytes.push(intVersion2 >> 24 & 0xFF);
    bytes.push(intVersion2 >> 16 & 0xFF);
    bytes.push(intVersion2 >> 8 & 0xFF);
    bytes.push(intVersion2 & 0xFF);

    bytes.push(intVersion1 >> 24 & 0xFF);
    bytes.push(intVersion1 >> 16 & 0xFF);
    bytes.push(intVersion1 >> 8 & 0xFF);
    bytes.push(intVersion1 & 0xFF);

    return bytes;
  }
}

var ErlangTypes = {
  Tuple: Tuple$1,
  PID,
  Reference,
  BitString
};

class ProcessSystem {

  constructor() {
    this.pids = new Map();
    this.mailboxes = new Map();
    this.names = new Map();
    this.links = new Map();
    this.monitors = new Map();

    const throttle = 5; //ms between scheduled tasks
    this.current_process = null;
    this.scheduler = new Scheduler(throttle);
    this.suspended = new Map();

    let process_system_scope = this;
    this.main_process_pid = this.spawn(function* () {
      yield process_system_scope.sleep(Symbol.for("Infinity"));
    });
    this.set_current(this.main_process_pid);
  }

  static *run(fun, args, context = null) {
    if (fun.constructor.name === "GeneratorFunction") {
      return yield* fun.apply(context, args);
    } else {
      return yield fun.apply(context, args);
    }
  }

  spawn(...args) {
    if (args.length === 1) {
      let fun = args[0];
      return this.add_proc(fun, [], false).pid;
    } else {
      let mod = args[0];
      let fun = args[1];
      let the_args = args[2];

      return this.add_proc(mod[fun], the_args, false, false).pid;
    }
  }

  spawn_link(...args) {
    if (args.length === 1) {
      let fun = args[0];
      return this.add_proc(fun, [], true, false).pid;
    } else {
      let mod = args[0];
      let fun = args[1];
      let the_args = args[2];

      return this.add_proc(mod[fun], the_args, true, false).pid;
    }
  }

  link(pid) {
    this.links.get(this.pid()).add(pid);
    this.links.get(pid).add(this.pid());
  }

  unlink(pid) {
    this.links.get(this.pid()).delete(pid);
    this.links.get(pid).delete(this.pid());
  }

  spawn_monitor(...args) {
    if (args.length === 1) {
      let fun = args[0];
      let process = this.add_proc(fun, [], false, true);
      return [process.pid, process.monitors[0]];
    } else {
      let mod = args[0];
      let fun = args[1];
      let the_args = args[2];
      let process = this.add_proc(mod[fun], the_args, false, true);

      return [process.pid, process.monitors[0]];
    }
  }

  monitor(pid) {
    const real_pid = this.pidof(pid);
    const ref = this.make_ref();

    if (real_pid) {

      this.monitors.set(ref, { 'monitor': this.current_process.pid, 'monitee': real_pid });
      this.pids.get(real_pid).monitors.push(ref);
      return ref;
    } else {
      this.send(this.current_process.pid, new ErlangTypes.Tuple('DOWN', ref, pid, real_pid, Symbol.for('noproc')));
      return ref;
    }
  }

  demonitor(ref) {
    if (this.monitor.has(ref)) {
      this.monitor.delete(ref);
      return true;
    }

    return false;
  }

  set_current(id) {
    let pid = this.pidof(id);
    if (pid !== null) {
      this.current_process = this.pids.get(pid);
      this.current_process.status = States.RUNNING;
    }
  }

  add_proc(fun, args, linked, monitored) {
    let newpid = new ErlangTypes.PID();
    let mailbox = new Mailbox();
    let newproc = new Process(newpid, fun, args, mailbox, this);

    this.pids.set(newpid, newproc);
    this.mailboxes.set(newpid, mailbox);
    this.links.set(newpid, new Set());

    if (linked) {
      this.link(newpid);
    }

    if (monitored) {
      this.monitor(newpid);
    }

    newproc.start();
    return newproc;
  }

  remove_proc(pid, exitreason) {
    this.pids.delete(pid);
    this.unregister(pid);
    this.scheduler.removePid(pid);

    if (this.links.has(pid)) {
      for (let linkpid of this.links.get(pid)) {
        this.exit(linkpid, exitreason);
        this.links.get(linkpid).delete(pid);
      }

      this.links.delete(pid);
    }
  }

  register(name, pid) {
    if (!this.names.has(name)) {
      this.names.set(name, pid);
    } else {
      throw new Error("Name is already registered to another process");
    }
  }

  whereis(name) {
    return this.names.has(name) ? this.names.get(name) : null;
  }

  registered() {
    return this.names.keys();
  }

  unregister(pid) {
    for (let name of this.names.keys()) {
      if (this.names.has(name) && this.names.get(name) === pid) {
        this.names.delete(name);
      }
    }
  }

  pid() {
    return this.current_process.pid;
  }

  pidof(id) {
    if (id instanceof ErlangTypes.PID) {
      return this.pids.has(id) ? id : null;
    } else if (id instanceof Process) {
      return id.pid;
    } else {
      let pid = this.whereis(id);
      if (pid === null) throw "Process name not registered: " + id + " (" + typeof id + ")";
      return pid;
    }
  }

  send(id, msg) {
    const pid = this.pidof(id);

    if (pid) {
      this.mailboxes.get(pid).deliver(msg);

      if (this.suspended.has(pid)) {
        let fun = this.suspended.get(pid);
        this.suspended.delete(pid);
        this.schedule(fun);
      }
    }

    return msg;
  }

  receive(fun, timeout = 0, timeoutFn = () => true) {
    let DateTimeout = null;

    if (timeout === 0 || timeout === Infinity) {
      DateTimeout = null;
    } else {
      DateTimeout = Date.now() + timeout;
    }

    return [States.RECEIVE, fun, DateTimeout, timeoutFn];
  }

  sleep(duration) {
    return [States.SLEEP, duration];
  }

  suspend(fun) {
    this.current_process.status = States.SUSPENDED;
    this.suspended.set(this.current_process.pid, fun);
  }

  delay(fun, time) {
    this.current_process.status = States.SLEEPING;

    if (Number.isInteger(time)) {
      this.scheduler.scheduleFuture(this.current_process.pid, time, fun);
    }
  }

  schedule(fun, pid) {
    const the_pid = pid != null ? pid : this.current_process.pid;
    this.scheduler.schedule(the_pid, fun);
  }

  exit(one, two) {
    let pid = null;
    let reason = null;
    let process = null;

    if (two) {
      pid = one;
      reason = two;
      process = this.pids.get(this.pidof(pid));

      if (process && process.is_trapping_exits() || reason === States.KILL || reason === States.NORMAL) {
        this.mailboxes.get(process.pid).deliver(new ErlangTypes.Tuple(States.EXIT, this.pid(), reason));
      } else {
        process.signal(reason);
      }
    } else {
      pid = this.current_process.pid;
      reason = one;
      process = this.current_process;

      process.signal(reason);
    }

    for (let ref in process.monitors) {
      let mons = this.monitors.get(ref);
      this.send(mons['monitor'], new ErlangTypes.Tuple('DOWN', ref, mons['monitee'], mons['monitee'], reason));
    }
  }

  error(reason) {
    this.current_process.signal(reason);
  }

  process_flag(...args) {
    if (args.length == 2) {
      const flag = args[0];
      const value = args[1];
      return this.current_process.process_flag(flag, value);
    } else {
      const pid = this.pidof(args[0]);
      const flag = args[1];
      const value = args[2];
      return this.pids.get(pid).process_flag(flag, value);
    }
  }

  put(key, value) {
    this.current_process.dict[key] = value;
  }

  get_process_dict() {
    return this.current_process.dict;
  }

  get(key, default_value = null) {
    if (key in this.current_process.dict) {
      return this.current_process.dict[key];
    } else {
      return default_value;
    }
  }

  get_keys(value) {
    if (value) {
      let keys = [];

      for (let key of Object.keys(this.current_process.dict)) {
        if (this.current_process.dict[key] === value) {
          keys.push(key);
        }
      }

      return keys;
    }

    return Object.keys(this.current_process.dict);
  }

  erase(key) {
    if (key != null) {
      delete this.current_process.dict[key];
    } else {
      this.current_process.dict = {};
    }
  }

  is_alive(pid) {
    const real_pid = this.pidof(pid);
    return real_pid != null;
  }

  list() {
    return Array.from(this.pids.keys());
  }

  make_ref() {
    return new ErlangTypes.Reference();
  }
}

var Processes = {
  ProcessSystem
};

/* @flow */

class Variable {

  constructor(default_value = Symbol.for("tailored.no_value")) {
    this.default_value = default_value;
  }
}

class Wildcard {
  constructor() {}
}

class StartsWith {

  constructor(prefix) {
    this.prefix = prefix;
  }
}

class Capture {

  constructor(value) {
    this.value = value;
  }
}

class HeadTail {
  constructor() {}
}

class Type {

  constructor(type, objPattern = {}) {
    this.type = type;
    this.objPattern = objPattern;
  }
}

class Bound {

  constructor(value) {
    this.value = value;
  }
}

class BitStringMatch {

  constructor(...values) {
    this.values = values;
  }

  length() {
    return values.length;
  }

  bit_size() {
    return this.byte_size() * 8;
  }

  byte_size() {
    let s = 0;

    for (let val of this.values) {
      s = s + val.unit * val.size / 8;
    }

    return s;
  }

  getValue(index) {
    return this.values(index);
  }

  getSizeOfValue(index) {
    let val = this.getValue(index);
    return val.unit * val.size;
  }

  getTypeOfValue(index) {
    return this.getValue(index).type;
  }
}

function variable(default_value = Symbol.for("tailored.no_value")) {
  return new Variable(default_value);
}

function wildcard() {
  return new Wildcard();
}

function startsWith(prefix) {
  return new StartsWith(prefix);
}

function capture(value) {
  return new Capture(value);
}

function headTail() {
  return new HeadTail();
}

function type(type, objPattern = {}) {
  return new Type(type, objPattern);
}

function bound(value) {
  return new Bound(value);
}

function bitStringMatch(...values) {
  return new BitStringMatch(...values);
}

function is_number(value) {
  return typeof value === 'number';
}

function is_string(value) {
  return typeof value === 'string';
}

function is_boolean(value) {
  return typeof value === 'boolean';
}

function is_symbol(value) {
  return typeof value === 'symbol';
}

function is_null(value) {
  return value === null;
}

function is_undefined(value) {
  return typeof value === 'undefined';
}

function is_variable(value) {
  return value instanceof Variable;
}

function is_wildcard(value) {
  return value instanceof Wildcard;
}

function is_headTail(value) {
  return value instanceof HeadTail;
}

function is_capture(value) {
  return value instanceof Capture;
}

function is_type(value) {
  return value instanceof Type;
}

function is_startsWith(value) {
  return value instanceof StartsWith;
}

function is_bound(value) {
  return value instanceof Bound;
}

function is_object(value) {
  return typeof value === 'object';
}

function is_array(value) {
  return Array.isArray(value);
}

function is_bitstring(value) {
  return value instanceof BitStringMatch;
}

const BitString$1 = ErlangTypes.BitString;

function resolveSymbol(pattern) {
  return function (value) {
    return is_symbol(value) && value === pattern;
  };
}

function resolveString(pattern) {
  return function (value) {
    return is_string(value) && value === pattern;
  };
}

function resolveNumber(pattern) {
  return function (value) {
    return is_number(value) && value === pattern;
  };
}

function resolveBoolean(pattern) {
  return function (value) {
    return is_boolean(value) && value === pattern;
  };
}

function resolveNull(pattern) {
  return function (value) {
    return is_null(value);
  };
}

function resolveBound(pattern) {
  return function (value, args) {
    if (typeof value === typeof pattern.value && value === pattern.value) {
      args.push(value);
      return true;
    }

    return false;
  };
}

function resolveWildcard() {
  return function () {
    return true;
  };
}

function resolveVariable() {
  return function (value, args) {
    args.push(value);
    return true;
  };
}

function resolveHeadTail() {
  return function (value, args) {
    if (!is_array(value) || value.length < 2) {
      return false;
    }

    const head = value[0];
    const tail = value.slice(1);

    args.push(head);
    args.push(tail);

    return true;
  };
}

function resolveCapture(pattern) {
  const matches = buildMatch(pattern.value);

  return function (value, args) {
    if (matches(value, args)) {
      args.push(value);
      return true;
    }

    return false;
  };
}

function resolveStartsWith(pattern) {
  const prefix = pattern.prefix;

  return function (value, args) {
    if (is_string(value) && value.startsWith(prefix)) {
      args.push(value.substring(prefix.length));
      return true;
    }

    return false;
  };
}

function resolveType(pattern) {
  return function (value, args) {
    if (value instanceof pattern.type) {
      const matches = buildMatch(pattern.objPattern);
      return matches(value, args) && args.push(value) > 0;
    }

    return false;
  };
}

function resolveArray(pattern) {
  const matches = pattern.map(x => buildMatch(x));

  return function (value, args) {
    if (!is_array(value) || value.length != pattern.length) {
      return false;
    }

    return value.every(function (v, i) {
      return matches[i](value[i], args);
    });
  };
}

function resolveObject(pattern) {
  let matches = {};

  for (let key of Object.keys(pattern).concat(Object.getOwnPropertySymbols(pattern))) {
    matches[key] = buildMatch(pattern[key]);
  }

  return function (value, args) {
    if (!is_object(value) || pattern.length > value.length) {
      return false;
    }

    for (let key of Object.keys(pattern).concat(Object.getOwnPropertySymbols(pattern))) {
      if (!(key in value) || !matches[key](value[key], args)) {
        return false;
      }
    }

    return true;
  };
}

function resolveBitString(pattern) {
  let patternBitString = [];

  for (let bitstringMatchPart of pattern.values) {
    if (is_variable(bitstringMatchPart.value)) {
      let size = getSize(bitstringMatchPart.unit, bitstringMatchPart.size);
      fillArray(patternBitString, size);
    } else {
      patternBitString = patternBitString.concat(new BitString$1(bitstringMatchPart).value);
    }
  }

  let patternValues = pattern.values;

  return function (value, args) {
    let bsValue = null;

    if (!is_string(value) && !(value instanceof BitString$1)) {
      return false;
    }

    if (is_string(value)) {
      bsValue = new BitString$1(BitString$1.binary(value));
    } else {
      bsValue = value;
    }

    let beginningIndex = 0;

    for (let i = 0; i < patternValues.length; i++) {
      let bitstringMatchPart = patternValues[i];

      if (is_variable(bitstringMatchPart.value) && bitstringMatchPart.type == 'binary' && bitstringMatchPart.size === undefined && i < patternValues.length - 1) {
        throw new Error("a binary field without size is only allowed at the end of a binary pattern");
      }

      let size = 0;
      let bsValueArrayPart = [];
      let patternBitStringArrayPart = [];
      size = getSize(bitstringMatchPart.unit, bitstringMatchPart.size);

      if (i === patternValues.length - 1) {
        bsValueArrayPart = bsValue.value.slice(beginningIndex);
        patternBitStringArrayPart = patternBitString.slice(beginningIndex);
      } else {
        bsValueArrayPart = bsValue.value.slice(beginningIndex, beginningIndex + size);
        patternBitStringArrayPart = patternBitString.slice(beginningIndex, beginningIndex + size);
      }

      if (is_variable(bitstringMatchPart.value)) {
        switch (bitstringMatchPart.type) {
          case 'integer':
            if (bitstringMatchPart.attributes && bitstringMatchPart.attributes.indexOf("signed") != -1) {
              args.push(new Int8Array([bsValueArrayPart[0]])[0]);
            } else {
              args.push(new Uint8Array([bsValueArrayPart[0]])[0]);
            }
            break;

          case 'float':
            if (size === 64) {
              args.push(Float64Array.from(bsValueArrayPart)[0]);
            } else if (size === 32) {
              args.push(Float32Array.from(bsValueArrayPart)[0]);
            } else {
              return false;
            }
            break;

          case 'bitstring':
            args.push(createBitString(bsValueArrayPart));
            break;

          case 'binary':
            args.push(String.fromCharCode.apply(null, new Uint8Array(bsValueArrayPart)));
            break;

          case 'utf8':
            args.push(String.fromCharCode.apply(null, new Uint8Array(bsValueArrayPart)));
            break;

          case 'utf16':
            args.push(String.fromCharCode.apply(null, new Uint16Array(bsValueArrayPart)));
            break;

          case 'utf32':
            args.push(String.fromCharCode.apply(null, new Uint32Array(bsValueArrayPart)));
            break;

          default:
            return false;
        }
      } else if (!arraysEqual(bsValueArrayPart, patternBitStringArrayPart)) {
        return false;
      }

      beginningIndex = beginningIndex + size;
    }

    return true;
  };
}

function getSize(unit, size) {
  return unit * size / 8;
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length != b.length) return false;

  for (var i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}

function fillArray(arr, num) {
  for (let i = 0; i < num; i++) {
    arr.push(0);
  }
}

function createBitString(arr) {
  let integerParts = arr.map(elem => BitString$1.integer(elem));
  return new BitString$1(...integerParts);
}

function resolveNoMatch() {
  return function () {
    return false;
  };
}

function buildMatch(pattern) {

  if (is_variable(pattern)) {
    return resolveVariable(pattern);
  }

  if (is_wildcard(pattern)) {
    return resolveWildcard(pattern);
  }

  if (is_undefined(pattern)) {
    return resolveWildcard(pattern);
  }

  if (is_headTail(pattern)) {
    return resolveHeadTail(pattern);
  }

  if (is_startsWith(pattern)) {
    return resolveStartsWith(pattern);
  }

  if (is_capture(pattern)) {
    return resolveCapture(pattern);
  }

  if (is_bound(pattern)) {
    return resolveBound(pattern);
  }

  if (is_type(pattern)) {
    return resolveType(pattern);
  }

  if (is_array(pattern)) {
    return resolveArray(pattern);
  }

  if (is_number(pattern)) {
    return resolveNumber(pattern);
  }

  if (is_string(pattern)) {
    return resolveString(pattern);
  }

  if (is_boolean(pattern)) {
    return resolveBoolean(pattern);
  }

  if (is_symbol(pattern)) {
    return resolveSymbol(pattern);
  }

  if (is_null(pattern)) {
    return resolveNull(pattern);
  }

  if (is_bitstring(pattern)) {
    return resolveBitString(pattern);
  }

  if (is_object(pattern)) {
    return resolveObject(pattern);
  }

  return resolveNoMatch();
}

class MatchError extends Error {
  constructor(arg) {
    super();

    if (typeof arg === 'symbol') {
      this.message = 'No match for: ' + arg.toString();
    } else if (Array.isArray(arg)) {
      let mappedValues = arg.map(x => x.toString());
      this.message = 'No match for: ' + mappedValues;
    } else {
      this.message = 'No match for: ' + arg;
    }

    this.stack = new Error().stack;
    this.name = this.constructor.name;
  }
}

class Clause {
  constructor(pattern, fn, guard = () => true) {
    this.pattern = buildMatch(pattern);
    this.arity = pattern.length;
    this.optionals = getOptionalValues(pattern);
    this.fn = fn;
    this.guard = guard;
  }
}

function clause(pattern, fn, guard = () => true) {
  return new Clause(pattern, fn, guard);
}

function defmatch(...clauses) {
  return function (...args) {
    for (let processedClause of clauses) {
      let result = [];
      args = fillInOptionalValues(args, processedClause.arity, processedClause.optionals);

      if (processedClause.pattern(args, result) && processedClause.guard.apply(this, result)) {
        return processedClause.fn.apply(this, result);
      }
    }

    console.error('No match for:', args);
    throw new MatchError(args);
  };
}

function defmatchgen(...clauses) {
  return function* (...args) {
    for (let processedClause of clauses) {
      let result = [];
      args = fillInOptionalValues(args, processedClause.arity, processedClause.optionals);

      if (processedClause.pattern(args, result) && processedClause.guard.apply(this, result)) {
        return yield* processedClause.fn.apply(this, result);
      }
    }

    console.error('No match for:', args);
    throw new MatchError(args);
  };
}

function getOptionalValues(pattern) {
  let optionals = [];

  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] instanceof Variable && pattern[i].default_value != Symbol.for("tailored.no_value")) {
      optionals.push([i, pattern[i].default_value]);
    }
  }

  return optionals;
}

function fillInOptionalValues(args, arity, optionals) {
  if (args.length === arity || optionals.length === 0) {
    return args;
  }

  if (args.length + optionals.length < arity) {
    return args;
  }

  let numberOfOptionalsToFill = arity - args.length;
  let optionalsToRemove = optionals.length - numberOfOptionalsToFill;

  let optionalsToUse = optionals.slice(optionalsToRemove);

  for (let [index, value] of optionalsToUse) {
    args.splice(index, 0, value);
    if (args.length === arity) {
      break;
    }
  }

  return args;
}

function match(pattern, expr, guard = () => true) {
  let result = [];
  let processedPattern = buildMatch(pattern);
  if (processedPattern(expr, result) && guard.apply(this, result)) {
    return result;
  } else {
    console.error('No match for:', expr);
    throw new MatchError(expr);
  }
}

function match_or_default(pattern, expr, guard = () => true, default_value = null) {
  let result = [];
  let processedPattern = buildMatch(pattern);
  if (processedPattern(expr, result) && guard.apply(this, result)) {
    return result;
  } else {
    return default_value;
  }
}

var Patterns = {
  defmatch, match, MatchError,
  variable, wildcard, startsWith,
  capture, headTail, type, bound,
  Clause, clause, bitStringMatch,
  match_or_default, defmatchgen
};

//https://github.com/airportyh/protomorphism
class Protocol {
  constructor(spec) {
    this.registry = new Map();
    this.fallback = null;

    for (let funName in spec) {
      this[funName] = createFun(funName).bind(this);
    }

    function createFun(funName) {

      return function (...args) {
        let thing = args[0];
        let fun = null;

        if (Number.isInteger(thing) && this.hasImplementation(Core.Integer)) {
          fun = this.registry.get(Core.Integer)[funName];
        } else if (typeof thing === "number" && !Number.isInteger(thing) && this.hasImplementation(Core.Float)) {
          fun = this.registry.get(Core.Float)[funName];
        } else if (typeof thing === "string" && this.hasImplementation(Core.BitString)) {
          fun = this.registry.get(Core.BitString)[funName];
        } else if (this.hasImplementation(thing)) {
          fun = this.registry.get(thing.constructor)[funName];
        } else if (this.fallback) {
          fun = this.fallback[funName];
        }

        if (fun != null) {
          let retval = fun.apply(this, args);
          return retval;
        }

        throw new Error("No implementation found for " + thing);
      };
    }
  }

  implementation(type, implementation) {
    if (type === null) {
      this.fallback = implementation;
    } else {
      this.registry.set(type, implementation);
    }
  }

  hasImplementation(thing) {
    if (thing === Core.Integer || thing === Core.Float || Core.BitString) {
      return this.registry.has(thing);
    }

    return this.registry.has(thing.constructor);
  }
}

function call_property(item, property) {
  let prop = null;

  if (typeof item === "number" || typeof item === "symbol" || typeof item === "boolean" || typeof item === "string") {
    if (item[property] !== undefined) {
      prop = property;
    } else if (item[Symbol.for(property)] !== undefined) {
      prop = Symbol.for(property);
    }
  } else {
    if (property in item) {
      prop = property;
    } else if (Symbol.for(property) in item) {
      prop = Symbol.for(property);
    }
  }

  if (prop === null) {
    throw new Error(`Property ${ property } not found in ${ item }`);
  }

  if (item[prop] instanceof Function) {
    return item[prop]();
  } else {
    return item[prop];
  }
}

function apply(...args) {
  if (args.length === 2) {
    args[0].apply(null, args.slice(1));
  } else {
    args[0][args[1]].apply(null, args.slice(2));
  }
}

function contains(left, right) {
  for (let x of right) {
    if (Core.Patterns.match_or_default(left, x) != null) {
      return true;
    }
  }

  return false;
}

function get_global() {
  if (typeof self !== "undefined") {
    return self;
  } else if (typeof window !== "undefined") {
    return window;
  } else if (typeof global !== "undefined") {
    return global;
  }

  throw new Error("No global state found");
}

function defstruct(defaults) {
  return class {
    constructor(update = {}) {
      let the_values = Object.assign(defaults, update);
      Object.assign(this, the_values);
    }

    static create(updates = {}) {
      let x = new this(updates);
      return Object.freeze(x);
    }
  };
}

function defexception(defaults) {
  return class extends Error {
    constructor(update = {}) {
      let message = update.message || "";
      super(message);

      let the_values = Object.assign(defaults, update);
      Object.assign(this, the_values);

      this.name = this.constructor.name;
      this.message = message;
      this[Symbol.for("__exception__")] = true;
      Error.captureStackTrace(this, this.constructor.name);
    }

    static create(updates = {}) {
      let x = new this(updates);
      return Object.freeze(x);
    }
  };
}

function defprotocol(spec) {
  return new Protocol(spec);
}

function defimpl(protocol, type, impl) {
  protocol.implementation(type, impl);
}

function get_object_keys(obj) {
  return Object.keys(obj).concat(Object.getOwnPropertySymbols(obj));
}

function is_valid_character(codepoint) {
  try {
    return String.fromCodePoint(codepoint) != null;
  } catch (e) {
    return false;
  }
}

//https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#Solution_2_%E2%80%93_rewrite_the_DOMs_atob()_and_btoa()_using_JavaScript's_TypedArrays_and_UTF-8
function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
    return String.fromCharCode('0x' + p1);
  }));
}

function delete_property_from_map(map, property) {
  let new_map = Object.assign(Object.create(map.constructor.prototype), map);
  delete new_map[property];

  return Object.freeze(new_map);
}

function class_to_obj(map) {
  let new_map = Object.assign({}, map);
  return Object.freeze(new_map);
}

function add_property_to_map(map, property, value) {
  let new_map = Object.assign({}, map);
  new_map[property] = value;
  return Object.freeze(new_map);
}

function update_map(map, property, value) {
  if (property in get_object_keys(map)) {
    return add_property_to_map(map, property, value);
  }

  throw "map does not have key";
}

function bnot(expr) {
  return ~expr;
}

function band(left, right) {
  return left & right;
}

function bor(left, right) {
  return left | right;
}

function bsl(left, right) {
  return left << right;
}

function bsr(left, right) {
  return left >> right;
}

function bxor(left, right) {
  return left ^ right;
}

function zip(list_of_lists) {
  if (list_of_lists.length === 0) {
    return Object.freeze([]);
  }

  let new_value = [];
  let smallest_length = list_of_lists[0];

  for (let x of list_of_lists) {
    if (x.length < smallest_length) {
      smallest_length = x.length;
    }
  }

  for (let i = 0; i < smallest_length; i++) {
    let current_value = [];
    for (let j = 0; j < list_of_lists.length; j++) {
      current_value.push(list_of_lists[j][i]);
    }

    new_value.push(new Core.Tuple(...current_value));
  }

  return Object.freeze(new_value);
}

function can_decode64(data) {
  try {
    atob(data);
    return true;
  } catch (e) {
    return false;
  }
}

function remove_from_list(list, element) {
  let found = false;

  return list.filter(elem => {
    if (!found && elem === element) {
      found = true;
      return false;
    }

    return true;
  });
}

function foldl(fun, acc, list) {
  let acc1 = acc;

  for (const el of list) {
    acc1 = fun(el, acc1);
  }

  return acc1;
}

function foldr(fun, acc, list) {
  let acc1 = acc;

  for (let i = list.length - 1; i >= 0; i--) {
    acc1 = fun(list[i], acc1);
  }

  return acc1;
}

function keyfind(key, n, tuplelist) {

  for (let i = tuplelist.length - 1; i >= 0; i--) {
    if (tuplelist[i].get(n) === key) {
      return tuplelist[i];
    }
  }

  return false;
}

function keydelete(key, n, tuplelist) {

  for (let i = tuplelist.length - 1; i >= 0; i--) {
    if (tuplelist[i].get(n) === key) {
      return tuplelist.concat([]).splice(i, 1);
    }
  }

  return tuplelist;
}

function keystore(key, n, list, newtuple) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].get(n) === key) {
      return list.concat([]).splice(i, 1, newtuple);
    }
  }

  return list.concat([]).push(newtuple);
}

function keymember(key, n, list) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].get(n) === key) {
      return true;
    }
  }

  return false;
}

function keytake(key, n, list) {
  if (!keymember(key, n, list)) {
    return false;
  }

  let tuple = keyfind(key, n, list);

  return new Tuple(tuple.get(n), tuple, keydelete(key, n, list));
}

function keyreplace(key, n, list, newtuple) {

  for (let i = tuplelist.length - 1; i >= 0; i--) {
    if (tuplelist[i].get(n) === key) {
      return tuplelist.concat([]).splice(i, 1, newtuple);
    }
  }

  return tuplelist;
}

function reverse(list) {
  return list.concat([]).reverse();
}

function maps_find(key, map) {
  if (key in get_object_keys(map)) {
    return new Core.Tuple(Symbol.for("ok"), map[key]);
  } else {
    return Symbol.for("error");
  }
}

function flatten(list, tail = []) {
  let new_list = [];

  for (let e of list) {
    if (Array.isArray(e)) {
      new_list = new_list.concat(flatten(e));
    } else {
      new_list.push(e);
    }
  }

  return Object.freeze(new_list.concat(tail));
}

function duplicate(n, elem) {
  let list = [];

  for (let i = 0; i < n; i++) {
    list.push(elem);
  }

  return Object.freeze(list);
}

function mapfoldl(fun, acc, list) {
  let newlist = [];

  for (let x of list) {
    let tup = fun(x, acc);
    newlist.push(tup.get(0));
    acc = tup.get(1);
  }

  return new Core.Tuple(Object.freeze(newlist), acc);
}

function filtermap(fun, list) {
  let newlist = [];

  for (x of list) {
    let result = fun(x);

    if (result === true) {
      newlist.push(x);
    } else if (result instanceof Core.Tuple) {
      newlist.push(result.get(1));
    }
  }

  return Object.freeze(newlist);
}

function maps_fold(fun, acc, map) {
  let acc1 = acc;

  for (let k of get_object_keys(map)) {
    acc1 = fun(k, map[k], acc1);
  }

  return acc1;
}

function* sleep_forever() {
  yield* Core.processes.sleep(Symbol("infinity"));
}

var Functions = {
  call_property,
  apply,
  contains,
  get_global,
  defstruct,
  defexception,
  defprotocol,
  defimpl,
  get_object_keys,
  is_valid_character,
  b64EncodeUnicode,
  delete_property_from_map,
  add_property_to_map,
  class_to_obj,
  can_decode64,
  bnot,
  band,
  bor,
  bsl,
  bsr,
  bxor,
  zip,
  foldl,
  foldr,
  remove_from_list,
  keydelete,
  keystore,
  keyfind,
  keytake,
  keyreplace,
  reverse,
  update_map,
  maps_find,
  flatten,
  duplicate,
  mapfoldl,
  filtermap,
  maps_fold,
  sleep_forever
};

function _case(condition, clauses) {
  return Core.Patterns.defmatch(...clauses)(condition);
}

function cond(clauses) {
  for (let clause of clauses) {
    if (clause[0]) {
      return clause[1]();
    }
  }

  throw new Error();
}

function map_update(map, values) {
  return Object.freeze(Object.assign(Object.create(map.constructor.prototype), map, values));
}

function _for(collections, fun, filter = () => true, into = [], previousValues = []) {
  let pattern = collections[0][0];
  let collection = collections[0][1];

  if (collections.length === 1) {
    if (collection instanceof Core.BitString) {
      let bsSlice = collection.slice(0, pattern.byte_size());
      let i = 1;

      while (bsSlice.byte_size == pattern.byte_size()) {
        let r = Core.Patterns.match_or_default(pattern, bsSlice);
        let args = previousValues.concat(r);

        if (r && filter.apply(this, args)) {
          into = into.concat([fun.apply(this, args)]);
        }

        bsSlice = collection.slice(pattern.byte_size() * i, pattern.byte_size() * (i + 1));
        i++;
      }

      return into;
    } else {
      for (let elem of collection) {
        let r = Core.Patterns.match_or_default(pattern, elem);
        let args = previousValues.concat(r);

        if (r && filter.apply(this, args)) {
          into = into.concat([fun.apply(this, args)]);
        }
      }

      return into;
    }
  } else {
    let _into = [];

    if (collection instanceof Core.BitString) {
      let bsSlice = collection.slice(0, pattern.byte_size());
      let i = 1;

      while (bsSlice.byte_size == pattern.byte_size()) {
        let r = Core.Patterns.match_or_default(pattern, bsSlice);
        if (r) {
          _into = into.concat(this._for(collections.slice(1), fun, filter, _into, previousValues.concat(r)));
        }

        bsSlice = collection.slice(pattern.byte_size() * i, pattern.byte_size() * (i + 1));
        i++;
      }
    } else {
      for (let elem of collection) {
        let r = Core.Patterns.match_or_default(pattern, elem);
        if (r) {
          _into = into.concat(this._for(collections.slice(1), fun, filter, _into, previousValues.concat(r)));
        }
      }
    }

    return _into;
  }
}

function _try(do_fun, rescue_function, catch_fun, else_function, after_function) {
  let result = null;

  try {
    result = do_fun();
  } catch (e) {
    let ex_result = null;

    if (rescue_function) {
      try {
        ex_result = rescue_function(e);
        return ex_result;
      } catch (ex) {
        if (ex instanceof Core.Patterns.MatchError) {
          throw ex;
        }
      }
    }

    if (catch_fun) {
      try {
        ex_result = catch_fun(e);
        return ex_result;
      } catch (ex) {
        if (ex instanceof Core.Patterns.MatchError) {
          throw ex;
        }
      }
    }

    throw e;
  } finally {
    if (after_function) {
      after_function();
    }
  }

  if (else_function) {
    try {
      return else_function(result);
    } catch (ex) {
      if (ex instanceof Core.Patterns.MatchError) {
        throw new Error("No Match Found in Else");
      }

      throw ex;
    }
  } else {
    return result;
  }
}

function _with(...args) {
  let argsToPass = [];
  let successFunction = null;
  let elseFunction = null;

  if (typeof args[args.length - 2] === 'function') {
    [successFunction, elseFunction] = args.splice(-2);
  } else {
    successFunction = args.pop();
  }

  for (let i = 0; i < args.length; i++) {
    let [pattern, func] = args[i];

    let result = func.apply(null, argsToPass);

    let patternResult = Core.Patterns.match_or_default(pattern, result);

    if (patternResult == null) {
      if (elseFunction) {
        return elseFunction.call(null, result);
      } else {
        return result;
      }
    } else {
      argsToPass = argsToPass.concat(patternResult);
    }
  }

  return successFunction.apply(null, argsToPass);
}

var SpecialForms = {
  _case,
  cond,
  map_update,
  _for,
  _try,
  _with
};

let store = new Map();
let names = new Map();

function get_key(key) {
  let real_key = key;

  if (names.has(key)) {
    real_key = names.get(key);
  }

  if (store.has(real_key)) {
    return real_key;
  }

  return new Error('Key Not Found');
}

function create(key, value, name = null) {

  if (name != null) {
    names.set(name, key);
  }

  store.set(key, value);
}

function update(key, value) {
  let real_key = get_key(key);
  store.set(real_key, value);
}

function read(key) {
  let real_key = get_key(key);
  return store.get(real_key);
}

function remove(key) {
  let real_key = get_key(key);
  return store.delete(real_key);
}

var Store = {
  create,
  read,
  update,
  remove
};

let processes = new Processes.ProcessSystem();

class Integer {}
class Float {}

var Core = {
  ProcessSystem: Processes.ProcessSystem,
  processes: processes,
  Tuple: ErlangTypes.Tuple,
  PID: ErlangTypes.PID,
  BitString: ErlangTypes.BitString,
  Patterns,
  Integer,
  Float,
  Functions,
  SpecialForms,
  Store
};

let Enum = {

  all__qmark__: function (collection, fun = x => x) {
    for (let elem of collection) {
      if (!fun(elem)) {
        return false;
      }
    }

    return true;
  },

  any__qmark__: function (collection, fun = x => x) {
    for (let elem of collection) {
      if (fun(elem)) {
        return true;
      }
    }

    return false;
  },

  at: function (collection, n, the_default = null) {
    if (n > this.count(collection) || n < 0) {
      return the_default;
    }

    return collection[n];
  },

  concat: function (...enumables) {
    return enumables[0].concat(enumables[1]);
  },

  count: function (collection, fun = null) {
    if (fun == null) {
      return collection.length;
    } else {
      return collection.filter(fun).length;
    }
  },

  drop: function (collection, count) {
    return collection.slice(count);
  },

  drop_while: function (collection, fun) {
    let count = 0;

    for (let elem of collection) {
      if (fun(elem)) {
        count = count + 1;
      } else {
        break;
      }
    }

    return collection.slice(count);
  },

  each: function (collection, fun) {
    for (let elem of collection) {
      fun(elem);
    }
  },

  empty__qmark__: function (collection) {
    return collection.length === 0;
  },

  fetch: function (collection, n) {
    if (Array.isArray(collection)) {
      if (n < this.count(collection) && n >= 0) {
        return new Core.Tuple(Symbol.for("ok"), collection[n]);
      } else {
        return Symbol.for("error");
      }
    }

    throw new Error("collection is not an Enumerable");
  },

  fetch__emark__: function (collection, n) {
    if (Array.isArray(collection)) {
      if (n < this.count(collection) && n >= 0) {
        return collection[n];
      } else {
        throw new Error("out of bounds error");
      }
    }

    throw new Error("collection is not an Enumerable");
  },

  filter: function (collection, fun) {
    let result = [];

    for (let elem of collection) {
      if (fun(elem)) {
        result.push(elem);
      }
    }

    return result;
  },

  filter_map: function (collection, filter, mapper) {
    return Enum.map(Enum.filter(collection, filter), mapper);
  },

  find: function (collection, if_none = null, fun) {
    for (let elem of collection) {
      if (fun(elem)) {
        return elem;
      }
    }

    return if_none;
  },

  into: function (collection, list) {
    return list.concat(collection);
  },

  map: function (collection, fun) {
    let result = [];

    for (let elem of collection) {
      result.push(fun(elem));
    }

    return result;
  },

  map_reduce: function (collection, acc, fun) {
    let mapped = Object.freeze([]);
    let the_acc = acc;

    for (var i = 0; i < this.count(collection); i++) {
      let tuple = fun(collection[i], the_acc);

      the_acc = tuple.get(1);
      mapped = Object.freeze(mapped.concat([tuple.get(0)]));
    }

    return new Core.Tuple(mapped, the_acc);
  },

  member__qmark__: function (collection, value) {
    return collection.includes(value);
  },

  reduce: function (collection, acc, fun) {
    let the_acc = acc;

    for (var i = 0; i < this.count(collection); i++) {
      let tuple = fun(collection[i], the_acc);

      the_acc = tuple.get(1);
    }

    return the_acc;
  },

  take: function (collection, count) {
    return collection.slice(0, count);
  },

  take_every: function (collection, nth) {
    let result = [];
    let index = 0;

    for (let elem of collection) {
      if (index % nth === 0) {
        result.push(elem);
      }
    }

    return Object.freeze(result);
  },

  take_while: function (collection, fun) {
    let count = 0;

    for (let elem of collection) {
      if (fun(elem)) {
        count = count + 1;
      } else {
        break;
      }
    }

    return collection.slice(0, count);
  },

  to_list: function (collection) {
    return collection;
  }
};

var elixir = {
  Core,
  Enum
};

export default elixir;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWxpeGlyLkJvb3RzdHJhcC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vbm9kZV9tb2R1bGVzL2VybGFuZy1wcm9jZXNzZXMvc3JjL3Byb2Nlc3Nlcy9tYWlsYm94LmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2VybGFuZy1wcm9jZXNzZXMvc3JjL3Byb2Nlc3Nlcy9zdGF0ZXMuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvZXJsYW5nLXByb2Nlc3Nlcy9zcmMvcHJvY2Vzc2VzL3Byb2Nlc3MuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvZXJsYW5nLXByb2Nlc3Nlcy9zcmMvcHJvY2Vzc2VzL3NjaGVkdWxlci5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9lcmxhbmctdHlwZXMvc3JjL2VybGFuZy10eXBlcy90dXBsZS5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9lcmxhbmctdHlwZXMvc3JjL2VybGFuZy10eXBlcy9waWQuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvZXJsYW5nLXR5cGVzL3NyYy9lcmxhbmctdHlwZXMvcmVmZXJlbmNlLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL2VybGFuZy10eXBlcy9zcmMvZXJsYW5nLXR5cGVzL2JpdF9zdHJpbmcuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvZXJsYW5nLXR5cGVzL3NyYy9pbmRleC5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy9lcmxhbmctcHJvY2Vzc2VzL3NyYy9wcm9jZXNzZXMvcHJvY2Vzc19zeXN0ZW0uanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvZXJsYW5nLXByb2Nlc3Nlcy9zcmMvaW5kZXguanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvdGFpbG9yZWQvc3JjL3RhaWxvcmVkL3R5cGVzLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3RhaWxvcmVkL3NyYy90YWlsb3JlZC9jaGVja3MuanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvdGFpbG9yZWQvc3JjL3RhaWxvcmVkL3Jlc29sdmVycy5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy90YWlsb3JlZC9zcmMvdGFpbG9yZWQvbWF0Y2guanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvdGFpbG9yZWQvc3JjL3RhaWxvcmVkL2RlZm1hdGNoLmpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3RhaWxvcmVkL3NyYy9pbmRleC5qcyIsIi4uLy4uL3NyYy9qYXZhc2NyaXB0L2xpYi9jb3JlL3Byb3RvY29sLmpzIiwiLi4vLi4vc3JjL2phdmFzY3JpcHQvbGliL2NvcmUvZnVuY3Rpb25zLmpzIiwiLi4vLi4vc3JjL2phdmFzY3JpcHQvbGliL2NvcmUvc3BlY2lhbF9mb3Jtcy5qcyIsIi4uLy4uL3NyYy9qYXZhc2NyaXB0L2xpYi9jb3JlL3N0b3JlLmpzIiwiLi4vLi4vc3JjL2phdmFzY3JpcHQvbGliL2NvcmUuanMiLCIuLi8uLi9zcmMvamF2YXNjcmlwdC9saWIvZW51bS5qcyIsIi4uLy4uL3NyYy9qYXZhc2NyaXB0L2VsaXhpci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJcInVzZSBzdHJpY3RcIjtcblxuLyogQGZsb3cgKi9cblxuY2xhc3MgTWFpbGJveHtcbiAgY29uc3RydWN0b3IoKXtcbiAgICB0aGlzLm1lc3NhZ2VzID0gW107XG4gIH1cblxuICBkZWxpdmVyKG1lc3NhZ2Upe1xuICAgIHRoaXMubWVzc2FnZXMucHVzaChtZXNzYWdlKTtcbiAgICByZXR1cm4gbWVzc2FnZTtcbiAgfVxuXG4gIGdldCgpe1xuICAgIHJldHVybiB0aGlzLm1lc3NhZ2VzO1xuICB9XG5cbiAgaXNFbXB0eSgpe1xuICAgIHJldHVybiB0aGlzLm1lc3NhZ2VzLmxlbmd0aCA9PT0gMDtcbiAgfVxuXG4gIHJlbW92ZUF0KGluZGV4KXtcbiAgICB0aGlzLm1lc3NhZ2VzLnNwbGljZShpbmRleCwgMSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgTWFpbGJveDtcbiIsImV4cG9ydCBkZWZhdWx0IHtcbiAgTk9STUFMOiBTeW1ib2wuZm9yKFwibm9ybWFsXCIpLFxuICBLSUxMOiBTeW1ib2wuZm9yKFwia2lsbFwiKSxcbiAgU1VTUEVORDogU3ltYm9sLmZvcihcInN1c3BlbmRcIiksXG4gIENPTlRJTlVFOiBTeW1ib2wuZm9yKFwiY29udGludWVcIiksXG4gIFJFQ0VJVkU6IFN5bWJvbC5mb3IoXCJyZWNlaXZlXCIpLFxuICBTRU5EOiBTeW1ib2wuZm9yKFwic2VuZFwiKSxcbiAgU0xFRVBJTkc6IFN5bWJvbC5mb3IoXCJzbGVlcGluZ1wiKSxcbiAgUlVOTklORzogU3ltYm9sLmZvcihcInJ1bm5pbmdcIiksXG4gIFNVU1BFTkRFRDogU3ltYm9sLmZvcihcInN1c3BlbmRlZFwiKSxcbiAgU1RPUFBFRDogU3ltYm9sLmZvcihcInN0b3BwZWRcIiksXG4gIFNMRUVQOiBTeW1ib2wuZm9yKFwic2xlZXBcIiksXG4gIEVYSVQ6IFN5bWJvbC5mb3IoXCJleGl0XCIpLFxuICBOT01BVENIOiBTeW1ib2wuZm9yKFwibm9fbWF0Y2hcIilcbn0iLCJcInVzZSBzdHJpY3RcIjtcblxuLyogQGZsb3cgKi9cbmltcG9ydCBNYWlsYm94IGZyb20gXCIuL21haWxib3hcIjtcbmltcG9ydCBQcm9jZXNzU3lzdGVtIGZyb20gXCIuL3Byb2Nlc3Nfc3lzdGVtXCI7XG5pbXBvcnQgU3RhdGVzIGZyb20gXCIuL3N0YXRlc1wiO1xuXG5mdW5jdGlvbiBpc19zbGVlcCh2YWx1ZSl7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KHZhbHVlKSAmJiB2YWx1ZVswXSA9PT0gU3RhdGVzLlNMRUVQO1xufVxuXG5mdW5jdGlvbiBpc19yZWNlaXZlKHZhbHVlKXtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsdWUpICYmIHZhbHVlWzBdID09PSBTdGF0ZXMuUkVDRUlWRTtcbn1cblxuZnVuY3Rpb24gcmVjZWl2ZV90aW1lZF9vdXQodmFsdWUpe1xuICByZXR1cm4gdmFsdWVbMl0gIT0gbnVsbCAmJiB2YWx1ZVsyXSA8IERhdGUubm93KCk7XG59XG5cbmNsYXNzIFByb2Nlc3Mge1xuICBjb25zdHJ1Y3RvcihwaWQsIGZ1bmMsIGFyZ3MsIG1haWxib3gsIHN5c3RlbSl7XG4gICAgdGhpcy5waWQgPSBwaWQ7XG4gICAgdGhpcy5mdW5jID0gZnVuYztcbiAgICB0aGlzLmFyZ3MgPSBhcmdzO1xuICAgIHRoaXMubWFpbGJveCA9IG1haWxib3g7XG4gICAgdGhpcy5zeXN0ZW0gPSBzeXN0ZW07XG4gICAgdGhpcy5zdGF0dXMgPSBTdGF0ZXMuU1RPUFBFRDtcbiAgICB0aGlzLmRpY3QgPSB7fTtcbiAgICB0aGlzLmZsYWdzID0ge307XG4gICAgdGhpcy5tb25pdG9ycyA9IFtdO1xuICB9XG5cbiAgc3RhcnQoKXtcbiAgICBjb25zdCBmdW5jdGlvbl9zY29wZSA9IHRoaXM7XG4gICAgbGV0IG1hY2hpbmUgPSB0aGlzLm1haW4oKTtcblxuICAgIHRoaXMuc3lzdGVtLnNjaGVkdWxlKGZ1bmN0aW9uKCkge1xuICAgICAgZnVuY3Rpb25fc2NvcGUuc3lzdGVtLnNldF9jdXJyZW50KGZ1bmN0aW9uX3Njb3BlLnBpZCk7XG4gICAgICBmdW5jdGlvbl9zY29wZS5ydW4obWFjaGluZSwgbWFjaGluZS5uZXh0KCkpO1xuICAgIH0sIHRoaXMucGlkKTtcbiAgfVxuXG4gICptYWluKCkge1xuICAgIGxldCByZXR2YWwgPSBTdGF0ZXMuTk9STUFMO1xuXG4gICAgdHJ5IHtcbiAgICAgIHlpZWxkKiB0aGlzLmZ1bmMuYXBwbHkobnVsbCwgdGhpcy5hcmdzKTtcbiAgICB9IGNhdGNoKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICByZXR2YWwgPSBlO1xuICAgIH1cblxuICAgIHRoaXMuc3lzdGVtLmV4aXQocmV0dmFsKTtcbiAgfVxuXG4gIHByb2Nlc3NfZmxhZyhmbGFnLCB2YWx1ZSl7XG4gICAgY29uc3Qgb2xkX3ZhbHVlID0gdGhpcy5mbGFnc1tmbGFnXTtcbiAgICB0aGlzLmZsYWdzW2ZsYWddID0gdmFsdWU7XG4gICAgcmV0dXJuIG9sZF92YWx1ZTtcbiAgfVxuXG4gIGlzX3RyYXBwaW5nX2V4aXRzKCl7XG4gICAgcmV0dXJuIHRoaXMuZmxhZ3NbU3ltYm9sLmZvcihcInRyYXBfZXhpdFwiKV0gJiYgdGhpcy5mbGFnc1tTeW1ib2wuZm9yKFwidHJhcF9leGl0XCIpXSA9PSB0cnVlO1xuICB9XG5cbiAgc2lnbmFsKHJlYXNvbil7XG4gICAgaWYocmVhc29uICE9PSBTdGF0ZXMuTk9STUFMKXtcbiAgICAgIGNvbnNvbGUuZXJyb3IocmVhc29uKTtcbiAgICB9XG5cbiAgICB0aGlzLnN5c3RlbS5yZW1vdmVfcHJvYyh0aGlzLnBpZCwgcmVhc29uKTtcbiAgfVxuXG4gIHJlY2VpdmUoZnVuKXtcbiAgICBsZXQgdmFsdWUgPSBTdGF0ZXMuTk9NQVRDSDtcbiAgICBsZXQgbWVzc2FnZXMgPSB0aGlzLm1haWxib3guZ2V0KCk7XG5cbiAgICBmb3IobGV0IGkgPSAwOyBpIDwgbWVzc2FnZXMubGVuZ3RoOyBpKyspe1xuICAgICAgdHJ5e1xuICAgICAgICB2YWx1ZSA9IGZ1bihtZXNzYWdlc1tpXSk7XG4gICAgICAgIGlmKHZhbHVlICE9PSBTdGF0ZXMuTk9NQVRDSCl7XG4gICAgICAgICAgdGhpcy5tYWlsYm94LnJlbW92ZUF0KGkpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9Y2F0Y2goZSl7XG4gICAgICAgIGlmKGUuY29uc3RydWN0b3IubmFtZSAhPSBcIk1hdGNoRXJyb3JcIil7XG4gICAgICAgICAgdGhpcy5leGl0KGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgcnVuKG1hY2hpbmUsIHN0ZXApe1xuICAgIGNvbnN0IGZ1bmN0aW9uX3Njb3BlID0gdGhpcztcblxuICAgIGlmKCFzdGVwLmRvbmUpe1xuICAgICAgbGV0IHZhbHVlID0gc3RlcC52YWx1ZTtcblxuICAgICAgaWYoaXNfc2xlZXAodmFsdWUpKXtcblxuICAgICAgICB0aGlzLnN5c3RlbS5kZWxheShmdW5jdGlvbigpIHtcbiAgICAgICAgICBmdW5jdGlvbl9zY29wZS5zeXN0ZW0uc2V0X2N1cnJlbnQoZnVuY3Rpb25fc2NvcGUucGlkKTtcbiAgICAgICAgICBmdW5jdGlvbl9zY29wZS5ydW4obWFjaGluZSwgbWFjaGluZS5uZXh0KCkpO1xuICAgICAgICB9LCB2YWx1ZVsxXSk7XG5cbiAgICAgIH1lbHNlIGlmKGlzX3JlY2VpdmUodmFsdWUpICYmIHJlY2VpdmVfdGltZWRfb3V0KHZhbHVlKSl7XG5cbiAgICAgICAgbGV0IHJlc3VsdCA9IHZhbHVlWzNdKCk7XG5cbiAgICAgICAgdGhpcy5zeXN0ZW0uc2NoZWR1bGUoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgZnVuY3Rpb25fc2NvcGUuc3lzdGVtLnNldF9jdXJyZW50KGZ1bmN0aW9uX3Njb3BlLnBpZCk7XG4gICAgICAgICAgZnVuY3Rpb25fc2NvcGUucnVuKG1hY2hpbmUsIG1hY2hpbmUubmV4dChyZXN1bHQpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgIH1lbHNlIGlmKGlzX3JlY2VpdmUodmFsdWUpKXtcblxuICAgICAgICBsZXQgcmVzdWx0ID0gZnVuY3Rpb25fc2NvcGUucmVjZWl2ZSh2YWx1ZVsxXSk7XG5cbiAgICAgICAgaWYocmVzdWx0ID09PSBTdGF0ZXMuTk9NQVRDSCl7XG4gICAgICAgICAgdGhpcy5zeXN0ZW0uc3VzcGVuZChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uX3Njb3BlLnN5c3RlbS5zZXRfY3VycmVudChmdW5jdGlvbl9zY29wZS5waWQpO1xuICAgICAgICAgICAgZnVuY3Rpb25fc2NvcGUucnVuKG1hY2hpbmUsIHN0ZXApO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICB0aGlzLnN5c3RlbS5zY2hlZHVsZShmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uX3Njb3BlLnN5c3RlbS5zZXRfY3VycmVudChmdW5jdGlvbl9zY29wZS5waWQpO1xuICAgICAgICAgICAgZnVuY3Rpb25fc2NvcGUucnVuKG1hY2hpbmUsIG1hY2hpbmUubmV4dChyZXN1bHQpKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICB9ZWxzZXtcbiAgICAgICAgdGhpcy5zeXN0ZW0uc2NoZWR1bGUoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgZnVuY3Rpb25fc2NvcGUuc3lzdGVtLnNldF9jdXJyZW50KGZ1bmN0aW9uX3Njb3BlLnBpZCk7XG4gICAgICAgICAgZnVuY3Rpb25fc2NvcGUucnVuKG1hY2hpbmUsIG1hY2hpbmUubmV4dCh2YWx1ZSkpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgUHJvY2VzcztcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5jbGFzcyBQcm9jZXNzUXVldWUge1xuICBjb25zdHJ1Y3RvcihwaWQpe1xuICAgIHRoaXMucGlkID0gcGlkO1xuICAgIHRoaXMudGFza3MgPSBbXTtcbiAgfVxuXG4gIGVtcHR5KCl7XG4gICAgcmV0dXJuIHRoaXMudGFza3MubGVuZ3RoID09PSAwO1xuICB9XG5cbiAgYWRkKHRhc2spe1xuICAgIHRoaXMudGFza3MucHVzaCh0YXNrKTtcbiAgfVxuXG4gIG5leHQoKXtcbiAgICByZXR1cm4gdGhpcy50YXNrcy5zaGlmdCgpO1xuICB9XG59XG5cbmNsYXNzIFNjaGVkdWxlciB7XG4gICAgY29uc3RydWN0b3IodGhyb3R0bGUgPSAwLCByZWR1Y3Rpb25zX3Blcl9wcm9jZXNzID0gOCl7XG4gICAgICAgIHRoaXMuaXNSdW5uaW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMuaW52b2tlTGF0ZXIgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHsgc2V0VGltZW91dChjYWxsYmFjaywgdGhyb3R0bGUpOyB9O1xuXG4gICAgICAgIC8vIEluIG91ciBjYXNlIGEgcmVkdWN0aW9uIGlzIGVxdWFsIHRvIGEgdGFzayBjYWxsXG4gICAgICAgIC8vIENvbnRyb2xzIGhvdyBtYW55IHRhc2tzIGFyZSBjYWxsZWQgYXQgYSB0aW1lIHBlciBwcm9jZXNzXG4gICAgICAgIHRoaXMucmVkdWN0aW9uc19wZXJfcHJvY2VzcyA9IHJlZHVjdGlvbnNfcGVyX3Byb2Nlc3M7XG4gICAgICAgIHRoaXMucXVldWVzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLnJ1bigpO1xuICB9XG5cbiAgYWRkVG9RdWV1ZShwaWQsIHRhc2spe1xuICAgIGlmKCF0aGlzLnF1ZXVlcy5oYXMocGlkKSl7XG4gICAgICB0aGlzLnF1ZXVlcy5zZXQocGlkLCBuZXcgUHJvY2Vzc1F1ZXVlKHBpZCkpO1xuICAgIH1cblxuICAgIHRoaXMucXVldWVzLmdldChwaWQpLmFkZCh0YXNrKTtcbiAgfVxuXG4gIHJlbW92ZVBpZChwaWQpe1xuICAgIHRoaXMuaXNSdW5uaW5nID0gdHJ1ZTtcblxuICAgIHRoaXMucXVldWVzLmRlbGV0ZShwaWQpO1xuXG4gICAgdGhpcy5pc1J1bm5pbmcgPSBmYWxzZTtcbiAgfVxuXG4gIHJ1bigpe1xuICAgIGlmICh0aGlzLmlzUnVubmluZykge1xuICAgICAgdGhpcy5pbnZva2VMYXRlcigoKSA9PiB7IHRoaXMucnVuKCk7IH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBmb3IobGV0IFtwaWQsIHF1ZXVlXSBvZiB0aGlzLnF1ZXVlcyl7XG4gICAgICAgIGxldCByZWR1Y3Rpb25zID0gMDtcbiAgICAgICAgd2hpbGUocXVldWUgJiYgIXF1ZXVlLmVtcHR5KCkgJiYgcmVkdWN0aW9ucyA8IHRoaXMucmVkdWN0aW9uc19wZXJfcHJvY2Vzcyl7XG4gICAgICAgICAgbGV0IHRhc2sgPSBxdWV1ZS5uZXh0KCk7XG4gICAgICAgICAgdGhpcy5pc1J1bm5pbmcgPSB0cnVlO1xuXG4gICAgICAgICAgbGV0IHJlc3VsdDtcblxuICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgIHJlc3VsdCA9IHRhc2soKTtcbiAgICAgICAgICB9Y2F0Y2goZSl7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICAgICAgcmVzdWx0ID0gZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aGlzLmlzUnVubmluZyA9IGZhbHNlO1xuXG4gICAgICAgICAgaWYgKHJlc3VsdCBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyByZXN1bHQ7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVkdWN0aW9ucysrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMuaW52b2tlTGF0ZXIoKCkgPT4geyB0aGlzLnJ1bigpOyB9KTtcbiAgICB9XG4gIH1cblxuICBhZGRUb1NjaGVkdWxlcihwaWQsIHRhc2ssIGR1ZVRpbWUgPSAwKSB7XG4gICAgaWYoZHVlVGltZSA9PT0gMCl7XG4gICAgICB0aGlzLmludm9rZUxhdGVyKCgpID0+IHtcbiAgICAgICAgdGhpcy5hZGRUb1F1ZXVlKHBpZCwgdGFzayk7XG4gICAgICB9KTtcbiAgICB9ZWxzZXtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICB0aGlzLmFkZFRvUXVldWUocGlkLCB0YXNrKTtcbiAgICAgIH0sIGR1ZVRpbWUpO1xuICAgIH1cbiAgfTtcblxuICBzY2hlZHVsZShwaWQsIHRhc2spe1xuICAgIHRoaXMuYWRkVG9TY2hlZHVsZXIocGlkLCAoKSA9PiB7IHRhc2soKTsgfSk7XG4gIH1cblxuICBzY2hlZHVsZUZ1dHVyZShwaWQsIGR1ZVRpbWUsIHRhc2spe1xuICAgIHRoaXMuYWRkVG9TY2hlZHVsZXIocGlkLCAoKSA9PiB7IHRhc2soKTsgfSwgZHVlVGltZSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgU2NoZWR1bGVyO1xuIiwiY2xhc3MgVHVwbGUge1xuXG4gIGNvbnN0cnVjdG9yKC4uLmFyZ3Mpe1xuICAgIHRoaXMudmFsdWVzID0gT2JqZWN0LmZyZWV6ZShhcmdzKTtcbiAgICB0aGlzLmxlbmd0aCA9IHRoaXMudmFsdWVzLmxlbmd0aDtcbiAgfVxuXG4gIGdldChpbmRleCkge1xuICAgIHJldHVybiB0aGlzLnZhbHVlc1tpbmRleF07XG4gIH1cblxuICBjb3VudCgpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZXMubGVuZ3RoO1xuICB9XG5cbiAgW1N5bWJvbC5pdGVyYXRvcl0oKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsdWVzW1N5bWJvbC5pdGVyYXRvcl0oKTtcbiAgfVxuXG4gIHRvU3RyaW5nKCkge1xuICAgIHZhciBpLCBzID0gXCJcIjtcbiAgICBmb3IgKGkgPSAwOyBpIDwgdGhpcy52YWx1ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChzICE9PSBcIlwiKSB7XG4gICAgICAgIHMgKz0gXCIsIFwiO1xuICAgICAgfVxuICAgICAgcyArPSB0aGlzLnZhbHVlc1tpXS50b1N0cmluZygpO1xuICAgIH1cblxuICAgIHJldHVybiBcIntcIiArIHMgKyBcIn1cIjtcbiAgfVxuXG4gIHB1dF9lbGVtKGluZGV4LCBlbGVtKXtcbiAgICBpZihpbmRleCA9PT0gdGhpcy5sZW5ndGgpe1xuICAgICAgbGV0IG5ld192YWx1ZXMgPSB0aGlzLnZhbHVlcy5jb25jYXQoW2VsZW1dKTtcbiAgICAgIHJldHVybiBuZXcgVHVwbGUoLi4ubmV3X3ZhbHVlcyk7XG4gICAgfVxuXG4gICAgbGV0IG5ld192YWx1ZXMgPSB0aGlzLnZhbHVlcy5jb25jYXQoW10pO1xuICAgIG5ld192YWx1ZXMuc3BsaWNlKGluZGV4LCAwLCBlbGVtKTtcbiAgICByZXR1cm4gbmV3IFR1cGxlKC4uLm5ld192YWx1ZXMpO1xuICB9XG5cbiAgcmVtb3ZlX2VsZW0oaW5kZXgpe1xuICAgIGxldCBuZXdfdmFsdWVzID0gdGhpcy52YWx1ZXMuY29uY2F0KFtdKTtcbiAgICBuZXdfdmFsdWVzLnNwbGljZShpbmRleCwgMSk7XG4gICAgcmV0dXJuIG5ldyBUdXBsZSguLi5uZXdfdmFsdWVzKTtcbiAgfVxuXG59XG5cbmV4cG9ydCBkZWZhdWx0IFR1cGxlO1xuIiwibGV0IHByb2Nlc3NfY291bnRlciA9IC0xO1xuXG5jbGFzcyBQSUQge1xuICBjb25zdHJ1Y3Rvcigpe1xuICAgIHByb2Nlc3NfY291bnRlciA9IHByb2Nlc3NfY291bnRlciArIDE7XG4gICAgdGhpcy5pZCA9IHByb2Nlc3NfY291bnRlcjtcbiAgfVxuXG4gIHRvU3RyaW5nKCl7XG4gICAgcmV0dXJuIFwiUElEIzwwLlwiICsgdGhpcy5pZCArIFwiLjA+XCI7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgUElEO1xuIiwibGV0IHJlZl9jb3VudGVyID0gLTE7XG5cbmNsYXNzIFJlZmVyZW5jZSB7XG4gIGNvbnN0cnVjdG9yKCl7XG4gICAgcmVmX2NvdW50ZXIgPSByZWZfY291bnRlciArIDE7XG4gICAgdGhpcy5pZCA9IHJlZl9jb3VudGVyO1xuICAgIHRoaXMucmVmID0gU3ltYm9sKCk7XG4gIH1cblxuICB0b1N0cmluZygpe1xuICAgIHJldHVybiBcIlJlZiM8MC4wLjAuXCIgKyB0aGlzLmlkICsgXCI+XCI7XG4gIH1cbn1cblxuXG5leHBvcnQgZGVmYXVsdCBSZWZlcmVuY2U7XG4iLCJjbGFzcyBCaXRTdHJpbmcge1xuICBjb25zdHJ1Y3RvciguLi5hcmdzKXtcbiAgICB0aGlzLnZhbHVlID0gT2JqZWN0LmZyZWV6ZSh0aGlzLnByb2Nlc3MoYXJncykpO1xuICAgIHRoaXMubGVuZ3RoID0gdGhpcy52YWx1ZS5sZW5ndGg7XG4gICAgdGhpcy5iaXRfc2l6ZSA9IHRoaXMubGVuZ3RoICogODtcbiAgICB0aGlzLmJ5dGVfc2l6ZSA9IHRoaXMubGVuZ3RoO1xuICB9XG5cbiAgZ2V0KGluZGV4KXtcbiAgICByZXR1cm4gdGhpcy52YWx1ZVtpbmRleF07XG4gIH1cblxuICBjb3VudCgpe1xuICAgIHJldHVybiB0aGlzLnZhbHVlLmxlbmd0aDtcbiAgfVxuXG4gIHNsaWNlKHN0YXJ0LCBlbmQgPSBudWxsKXtcbiAgICBsZXQgcyA9IHRoaXMudmFsdWUuc2xpY2Uoc3RhcnQsIGVuZCk7XG4gICAgbGV0IG1zID0gcy5tYXAoKGVsZW0pID0+IEJpdFN0cmluZy5pbnRlZ2VyKGVsZW0pKTtcbiAgICByZXR1cm4gbmV3IEJpdFN0cmluZyguLi5tcyk7XG4gIH1cblxuICBbU3ltYm9sLml0ZXJhdG9yXSgpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZVtTeW1ib2wuaXRlcmF0b3JdKCk7XG4gIH1cblxuICB0b1N0cmluZygpe1xuICAgIHZhciBpLCBzID0gXCJcIjtcbiAgICBmb3IgKGkgPSAwOyBpIDwgdGhpcy5jb3VudCgpOyBpKyspIHtcbiAgICAgIGlmIChzICE9PSBcIlwiKSB7XG4gICAgICAgIHMgKz0gXCIsIFwiO1xuICAgICAgfVxuICAgICAgcyArPSB0aGlzLmdldChpKS50b1N0cmluZygpO1xuICAgIH1cblxuICAgIHJldHVybiBcIjw8XCIgKyBzICsgXCI+PlwiO1xuICB9XG5cbiAgcHJvY2VzcyhiaXRTdHJpbmdQYXJ0cyl7XG4gICAgbGV0IHByb2Nlc3NlZF92YWx1ZXMgPSBbXTtcblxuICAgIHZhciBpO1xuICAgIGZvciAoaSA9IDA7IGkgPCBiaXRTdHJpbmdQYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgICAgbGV0IHByb2Nlc3NlZF92YWx1ZSA9IHRoaXNbJ3Byb2Nlc3NfJyArIGJpdFN0cmluZ1BhcnRzW2ldLnR5cGVdKGJpdFN0cmluZ1BhcnRzW2ldKTtcblxuICAgICAgZm9yKGxldCBhdHRyIG9mIGJpdFN0cmluZ1BhcnRzW2ldLmF0dHJpYnV0ZXMpe1xuICAgICAgICBwcm9jZXNzZWRfdmFsdWUgPSB0aGlzWydwcm9jZXNzXycgKyBhdHRyXShwcm9jZXNzZWRfdmFsdWUpO1xuICAgICAgfVxuXG4gICAgICBwcm9jZXNzZWRfdmFsdWVzID0gcHJvY2Vzc2VkX3ZhbHVlcy5jb25jYXQocHJvY2Vzc2VkX3ZhbHVlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcHJvY2Vzc2VkX3ZhbHVlcztcbiAgfVxuXG4gIHByb2Nlc3NfaW50ZWdlcih2YWx1ZSl7XG4gICAgcmV0dXJuIHZhbHVlLnZhbHVlO1xuICB9XG5cbiAgcHJvY2Vzc19mbG9hdCh2YWx1ZSl7XG4gICAgaWYodmFsdWUuc2l6ZSA9PT0gNjQpe1xuICAgICAgcmV0dXJuIEJpdFN0cmluZy5mbG9hdDY0VG9CeXRlcyh2YWx1ZS52YWx1ZSk7XG4gICAgfWVsc2UgaWYodmFsdWUuc2l6ZSA9PT0gMzIpe1xuICAgICAgcmV0dXJuIEJpdFN0cmluZy5mbG9hdDMyVG9CeXRlcyh2YWx1ZS52YWx1ZSk7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHNpemUgZm9yIGZsb2F0Jyk7XG4gIH1cblxuICBwcm9jZXNzX2JpdHN0cmluZyh2YWx1ZSl7XG4gICAgcmV0dXJuIHZhbHVlLnZhbHVlLnZhbHVlO1xuICB9XG5cbiAgcHJvY2Vzc19iaW5hcnkodmFsdWUpe1xuICAgIHJldHVybiBCaXRTdHJpbmcudG9VVEY4QXJyYXkodmFsdWUudmFsdWUpO1xuICB9XG5cbiAgcHJvY2Vzc191dGY4KHZhbHVlKXtcbiAgICByZXR1cm4gQml0U3RyaW5nLnRvVVRGOEFycmF5KHZhbHVlLnZhbHVlKTtcbiAgfVxuXG4gIHByb2Nlc3NfdXRmMTYodmFsdWUpe1xuICAgIHJldHVybiBCaXRTdHJpbmcudG9VVEYxNkFycmF5KHZhbHVlLnZhbHVlKTtcbiAgfVxuXG4gIHByb2Nlc3NfdXRmMzIodmFsdWUpe1xuICAgIHJldHVybiBCaXRTdHJpbmcudG9VVEYzMkFycmF5KHZhbHVlLnZhbHVlKTtcbiAgfVxuXG4gIHByb2Nlc3Nfc2lnbmVkKHZhbHVlKXtcbiAgICByZXR1cm4gKG5ldyBVaW50OEFycmF5KFt2YWx1ZV0pKVswXTtcbiAgfVxuXG4gIHByb2Nlc3NfdW5zaWduZWQodmFsdWUpe1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHByb2Nlc3NfbmF0aXZlKHZhbHVlKXtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICBwcm9jZXNzX2JpZyh2YWx1ZSl7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgcHJvY2Vzc19saXR0bGUodmFsdWUpe1xuICAgIHJldHVybiB2YWx1ZS5yZXZlcnNlKCk7XG4gIH1cblxuICBwcm9jZXNzX3NpemUodmFsdWUpe1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHByb2Nlc3NfdW5pdCh2YWx1ZSl7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgc3RhdGljIGludGVnZXIodmFsdWUpe1xuICAgIHJldHVybiBCaXRTdHJpbmcud3JhcCh2YWx1ZSwgeyAndHlwZSc6ICdpbnRlZ2VyJywgJ3VuaXQnOiAxLCAnc2l6ZSc6IDggfSk7XG4gIH1cblxuICBzdGF0aWMgZmxvYXQodmFsdWUpe1xuICAgIHJldHVybiBCaXRTdHJpbmcud3JhcCh2YWx1ZSwgeyAndHlwZSc6ICdmbG9hdCcsICd1bml0JzogMSwgJ3NpemUnOiA2NCB9KTtcbiAgfVxuXG4gIHN0YXRpYyBiaXRzdHJpbmcodmFsdWUpe1xuICAgIHJldHVybiBCaXRTdHJpbmcud3JhcCh2YWx1ZSwgeyAndHlwZSc6ICdiaXRzdHJpbmcnLCAndW5pdCc6IDEsICdzaXplJzogdmFsdWUuYml0X3NpemUgfSk7XG4gIH1cblxuICBzdGF0aWMgYml0cyh2YWx1ZSl7XG4gICAgcmV0dXJuIEJpdFN0cmluZy5iaXRzdHJpbmcodmFsdWUpO1xuICB9XG5cbiAgc3RhdGljIGJpbmFyeSh2YWx1ZSl7XG4gICAgcmV0dXJuIEJpdFN0cmluZy53cmFwKHZhbHVlLCB7ICd0eXBlJzogJ2JpbmFyeScsICd1bml0JzogOCwgJ3NpemUnOiB2YWx1ZS5sZW5ndGggfSk7XG4gIH1cblxuICBzdGF0aWMgYnl0ZXModmFsdWUpe1xuICAgIHJldHVybiBCaXRTdHJpbmcuYmluYXJ5KHZhbHVlKTtcbiAgfVxuXG4gIHN0YXRpYyB1dGY4KHZhbHVlKXtcbiAgICByZXR1cm4gQml0U3RyaW5nLndyYXAodmFsdWUsIHsgJ3R5cGUnOiAndXRmOCcsICd1bml0JzogMSwgJ3NpemUnOiB2YWx1ZS5sZW5ndGggIH0pO1xuICB9XG5cbiAgc3RhdGljIHV0ZjE2KHZhbHVlKXtcbiAgICByZXR1cm4gQml0U3RyaW5nLndyYXAodmFsdWUsIHsgJ3R5cGUnOiAndXRmMTYnLCAndW5pdCc6IDEsICdzaXplJzogdmFsdWUubGVuZ3RoICogMiB9KTtcbiAgfVxuXG4gIHN0YXRpYyB1dGYzMih2YWx1ZSl7XG4gICAgcmV0dXJuIEJpdFN0cmluZy53cmFwKHZhbHVlLCB7ICd0eXBlJzogJ3V0ZjMyJywgJ3VuaXQnOiAxLCAnc2l6ZSc6IHZhbHVlLmxlbmd0aCAqIDQgfSk7XG4gIH1cblxuICBzdGF0aWMgc2lnbmVkKHZhbHVlKXtcbiAgICByZXR1cm4gQml0U3RyaW5nLndyYXAodmFsdWUsIHt9LCAnc2lnbmVkJyk7XG4gIH1cblxuICBzdGF0aWMgdW5zaWduZWQodmFsdWUpe1xuICAgIHJldHVybiBCaXRTdHJpbmcud3JhcCh2YWx1ZSwge30sICd1bnNpZ25lZCcpO1xuICB9XG5cbiAgc3RhdGljIG5hdGl2ZSh2YWx1ZSl7XG4gICAgcmV0dXJuIEJpdFN0cmluZy53cmFwKHZhbHVlLCB7fSwgJ25hdGl2ZScpO1xuICB9XG5cbiAgc3RhdGljIGJpZyh2YWx1ZSl7XG4gICAgcmV0dXJuIEJpdFN0cmluZy53cmFwKHZhbHVlLCB7fSwgJ2JpZycpO1xuICB9XG5cbiAgc3RhdGljIGxpdHRsZSh2YWx1ZSl7XG4gICAgcmV0dXJuIEJpdFN0cmluZy53cmFwKHZhbHVlLCB7fSwgJ2xpdHRsZScpO1xuICB9XG5cbiAgc3RhdGljIHNpemUodmFsdWUsIGNvdW50KXtcbiAgICByZXR1cm4gQml0U3RyaW5nLndyYXAodmFsdWUsIHsnc2l6ZSc6IGNvdW50fSk7XG4gIH1cblxuICBzdGF0aWMgdW5pdCh2YWx1ZSwgY291bnQpe1xuICAgIHJldHVybiBCaXRTdHJpbmcud3JhcCh2YWx1ZSwgeyd1bml0JzogY291bnR9KTtcbiAgfVxuXG4gIHN0YXRpYyB3cmFwKHZhbHVlLCBvcHQsIG5ld19hdHRyaWJ1dGUgPSBudWxsKXtcbiAgICBsZXQgdGhlX3ZhbHVlID0gdmFsdWU7XG5cbiAgICBpZighKHZhbHVlIGluc3RhbmNlb2YgT2JqZWN0KSl7XG4gICAgICB0aGVfdmFsdWUgPSB7J3ZhbHVlJzogdmFsdWUsICdhdHRyaWJ1dGVzJzogW119O1xuICAgIH1cblxuICAgIHRoZV92YWx1ZSA9IE9iamVjdC5hc3NpZ24odGhlX3ZhbHVlLCBvcHQpO1xuXG4gICAgaWYobmV3X2F0dHJpYnV0ZSl7XG4gICAgICB0aGVfdmFsdWUuYXR0cmlidXRlcy5wdXNoKG5ld19hdHRyaWJ1dGUpO1xuICAgIH1cblxuXG4gICAgcmV0dXJuIHRoZV92YWx1ZTtcbiAgfVxuXG4gIHN0YXRpYyB0b1VURjhBcnJheShzdHIpIHtcbiAgICB2YXIgdXRmOCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgY2hhcmNvZGUgPSBzdHIuY2hhckNvZGVBdChpKTtcbiAgICAgIGlmIChjaGFyY29kZSA8IDB4ODApe1xuICAgICAgICB1dGY4LnB1c2goY2hhcmNvZGUpO1xuICAgICAgfVxuICAgICAgZWxzZSBpZiAoY2hhcmNvZGUgPCAweDgwMCkge1xuICAgICAgICB1dGY4LnB1c2goMHhjMCB8IChjaGFyY29kZSA+PiA2KSxcbiAgICAgICAgICAgICAgICAgIDB4ODAgfCAoY2hhcmNvZGUgJiAweDNmKSk7XG4gICAgICB9XG4gICAgICBlbHNlIGlmIChjaGFyY29kZSA8IDB4ZDgwMCB8fCBjaGFyY29kZSA+PSAweGUwMDApIHtcbiAgICAgICAgdXRmOC5wdXNoKDB4ZTAgfCAoY2hhcmNvZGUgPj4gMTIpLFxuICAgICAgICAgICAgICAgICAgMHg4MCB8ICgoY2hhcmNvZGUgPj4gNikgJiAweDNmKSxcbiAgICAgICAgICAgICAgICAgIDB4ODAgfCAoY2hhcmNvZGUgJiAweDNmKSk7XG4gICAgICB9XG4gICAgICAvLyBzdXJyb2dhdGUgcGFpclxuICAgICAgZWxzZSB7XG4gICAgICAgIGkrKztcbiAgICAgICAgLy8gVVRGLTE2IGVuY29kZXMgMHgxMDAwMC0weDEwRkZGRiBieVxuICAgICAgICAvLyBzdWJ0cmFjdGluZyAweDEwMDAwIGFuZCBzcGxpdHRpbmcgdGhlXG4gICAgICAgIC8vIDIwIGJpdHMgb2YgMHgwLTB4RkZGRkYgaW50byB0d28gaGFsdmVzXG4gICAgICAgIGNoYXJjb2RlID0gMHgxMDAwMCArICgoKGNoYXJjb2RlICYgMHgzZmYpIDw8IDEwKVxuICAgICAgICAgICAgICAgICAgfCAoc3RyLmNoYXJDb2RlQXQoaSkgJiAweDNmZikpO1xuICAgICAgICB1dGY4LnB1c2goMHhmMCB8IChjaGFyY29kZSA+PiAxOCksXG4gICAgICAgICAgICAgICAgICAweDgwIHwgKChjaGFyY29kZSA+PiAxMikgJiAweDNmKSxcbiAgICAgICAgICAgICAgICAgIDB4ODAgfCAoKGNoYXJjb2RlID4+IDYpICYgMHgzZiksXG4gICAgICAgICAgICAgICAgICAweDgwIHwgKGNoYXJjb2RlICYgMHgzZikpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdXRmODtcbiAgfVxuXG4gIHN0YXRpYyB0b1VURjE2QXJyYXkoc3RyKSB7XG4gICAgdmFyIHV0ZjE2ID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBjb2RlUG9pbnQgPSBzdHIuY29kZVBvaW50QXQoaSk7XG5cbiAgICAgIGlmKGNvZGVQb2ludCA8PSAyNTUpe1xuICAgICAgICB1dGYxNi5wdXNoKDApO1xuICAgICAgICB1dGYxNi5wdXNoKGNvZGVQb2ludCk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgdXRmMTYucHVzaCgoKGNvZGVQb2ludCA+PiA4KSAmIDB4RkYpKTtcbiAgICAgICAgdXRmMTYucHVzaCgoY29kZVBvaW50ICYgMHhGRikpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdXRmMTY7XG4gIH1cblxuXG4gIHN0YXRpYyB0b1VURjMyQXJyYXkoc3RyKSB7XG4gICAgdmFyIHV0ZjMyID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBjb2RlUG9pbnQgPSBzdHIuY29kZVBvaW50QXQoaSk7XG5cbiAgICAgIGlmKGNvZGVQb2ludCA8PSAyNTUpe1xuICAgICAgICB1dGYzMi5wdXNoKDApO1xuICAgICAgICB1dGYzMi5wdXNoKDApO1xuICAgICAgICB1dGYzMi5wdXNoKDApO1xuICAgICAgICB1dGYzMi5wdXNoKGNvZGVQb2ludCk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgdXRmMzIucHVzaCgwKTtcbiAgICAgICAgdXRmMzIucHVzaCgwKTtcbiAgICAgICAgdXRmMzIucHVzaCgoKGNvZGVQb2ludCA+PiA4KSAmIDB4RkYpKTtcbiAgICAgICAgdXRmMzIucHVzaCgoY29kZVBvaW50ICYgMHhGRikpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdXRmMzI7XG4gIH1cblxuICAvL2h0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMjAwMzQ5My9qYXZhc2NyaXB0LWZsb2F0LWZyb20tdG8tYml0c1xuICBzdGF0aWMgZmxvYXQzMlRvQnl0ZXMoZikge1xuICAgIHZhciBieXRlcyA9IFtdO1xuXG4gICAgdmFyIGJ1ZiA9IG5ldyBBcnJheUJ1ZmZlcig0KTtcbiAgICAobmV3IEZsb2F0MzJBcnJheShidWYpKVswXSA9IGY7XG5cbiAgICBsZXQgaW50VmVyc2lvbiA9IChuZXcgVWludDMyQXJyYXkoYnVmKSlbMF07XG5cbiAgICBieXRlcy5wdXNoKCgoaW50VmVyc2lvbiA+PiAyNCkgJiAweEZGKSk7XG4gICAgYnl0ZXMucHVzaCgoKGludFZlcnNpb24gPj4gMTYpICYgMHhGRikpO1xuICAgIGJ5dGVzLnB1c2goKChpbnRWZXJzaW9uID4+IDgpICYgMHhGRikpO1xuICAgIGJ5dGVzLnB1c2goKGludFZlcnNpb24gJiAweEZGKSk7XG5cbiAgICByZXR1cm4gYnl0ZXM7XG4gIH1cblxuICBzdGF0aWMgZmxvYXQ2NFRvQnl0ZXMoZikge1xuICAgIHZhciBieXRlcyA9IFtdO1xuXG4gICAgdmFyIGJ1ZiA9IG5ldyBBcnJheUJ1ZmZlcig4KTtcbiAgICAobmV3IEZsb2F0NjRBcnJheShidWYpKVswXSA9IGY7XG5cbiAgICB2YXIgaW50VmVyc2lvbjEgPSAobmV3IFVpbnQzMkFycmF5KGJ1ZikpWzBdO1xuICAgIHZhciBpbnRWZXJzaW9uMiA9IChuZXcgVWludDMyQXJyYXkoYnVmKSlbMV07XG5cbiAgICBieXRlcy5wdXNoKCgoaW50VmVyc2lvbjIgPj4gMjQpICYgMHhGRikpO1xuICAgIGJ5dGVzLnB1c2goKChpbnRWZXJzaW9uMiA+PiAxNikgJiAweEZGKSk7XG4gICAgYnl0ZXMucHVzaCgoKGludFZlcnNpb24yID4+IDgpICYgMHhGRikpO1xuICAgIGJ5dGVzLnB1c2goKGludFZlcnNpb24yICYgMHhGRikpO1xuXG4gICAgYnl0ZXMucHVzaCgoKGludFZlcnNpb24xID4+IDI0KSAmIDB4RkYpKTtcbiAgICBieXRlcy5wdXNoKCgoaW50VmVyc2lvbjEgPj4gMTYpICYgMHhGRikpO1xuICAgIGJ5dGVzLnB1c2goKChpbnRWZXJzaW9uMSA+PiA4KSAmIDB4RkYpKTtcbiAgICBieXRlcy5wdXNoKChpbnRWZXJzaW9uMSAmIDB4RkYpKTtcblxuICAgIHJldHVybiBieXRlcztcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBCaXRTdHJpbmc7XG4iLCJpbXBvcnQgVHVwbGUgZnJvbSAnLi9lcmxhbmctdHlwZXMvdHVwbGUuanMnO1xuaW1wb3J0IFBJRCBmcm9tICcuL2VybGFuZy10eXBlcy9waWQuanMnO1xuaW1wb3J0IFJlZmVyZW5jZSBmcm9tICcuL2VybGFuZy10eXBlcy9yZWZlcmVuY2UuanMnO1xuaW1wb3J0IEJpdFN0cmluZyBmcm9tICcuL2VybGFuZy10eXBlcy9iaXRfc3RyaW5nLmpzJztcblxuXG5leHBvcnQgZGVmYXVsdCB7XG4gIFR1cGxlLFxuICBQSUQsXG4gIFJlZmVyZW5jZSxcbiAgQml0U3RyaW5nXG59O1xuIiwiLyogQGZsb3cgKi9cblwidXNlIHN0cmljdFwiO1xuXG5pbXBvcnQgTWFpbGJveCBmcm9tIFwiLi9tYWlsYm94XCI7XG5pbXBvcnQgUHJvY2VzcyBmcm9tIFwiLi9wcm9jZXNzXCI7XG5pbXBvcnQgU3RhdGVzIGZyb20gXCIuL3N0YXRlc1wiO1xuaW1wb3J0IFNjaGVkdWxlciBmcm9tIFwiLi9zY2hlZHVsZXJcIjtcbmltcG9ydCBFcmxhbmdUeXBlcyBmcm9tIFwiZXJsYW5nLXR5cGVzXCI7XG5cblxuY2xhc3MgUHJvY2Vzc1N5c3RlbSB7XG5cbiAgY29uc3RydWN0b3IoKXtcbiAgICB0aGlzLnBpZHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5tYWlsYm94ZXMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5uYW1lcyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmxpbmtzID0gbmV3IE1hcCgpO1xuICAgIHRoaXMubW9uaXRvcnMgPSBuZXcgTWFwKCk7XG5cbiAgICBjb25zdCB0aHJvdHRsZSA9IDU7IC8vbXMgYmV0d2VlbiBzY2hlZHVsZWQgdGFza3NcbiAgICB0aGlzLmN1cnJlbnRfcHJvY2VzcyA9IG51bGw7XG4gICAgdGhpcy5zY2hlZHVsZXIgPSBuZXcgU2NoZWR1bGVyKHRocm90dGxlKTtcbiAgICB0aGlzLnN1c3BlbmRlZCA9IG5ldyBNYXAoKTtcblxuICAgIGxldCBwcm9jZXNzX3N5c3RlbV9zY29wZSA9IHRoaXM7XG4gICAgdGhpcy5tYWluX3Byb2Nlc3NfcGlkID0gdGhpcy5zcGF3bihmdW5jdGlvbiooKXtcbiAgICAgIHlpZWxkIHByb2Nlc3Nfc3lzdGVtX3Njb3BlLnNsZWVwKFN5bWJvbC5mb3IoXCJJbmZpbml0eVwiKSk7XG4gICAgfSk7XG4gICAgdGhpcy5zZXRfY3VycmVudCh0aGlzLm1haW5fcHJvY2Vzc19waWQpO1xuICB9XG5cbiAgc3RhdGljICogcnVuKGZ1biwgYXJncywgY29udGV4dCA9IG51bGwpe1xuICAgIGlmKGZ1bi5jb25zdHJ1Y3Rvci5uYW1lID09PSBcIkdlbmVyYXRvckZ1bmN0aW9uXCIpe1xuICAgICAgcmV0dXJuIHlpZWxkKiBmdW4uYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgfWVsc2V7XG4gICAgICByZXR1cm4geWllbGQgZnVuLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgIH1cbiAgfVxuXG4gIHNwYXduKC4uLmFyZ3Mpe1xuICAgIGlmKGFyZ3MubGVuZ3RoID09PSAxKXtcbiAgICAgIGxldCBmdW4gPSBhcmdzWzBdO1xuICAgICAgcmV0dXJuIHRoaXMuYWRkX3Byb2MoZnVuLCBbXSwgZmFsc2UpLnBpZDtcblxuICAgIH1lbHNle1xuICAgICAgbGV0IG1vZCA9IGFyZ3NbMF07XG4gICAgICBsZXQgZnVuID0gYXJnc1sxXTtcbiAgICAgIGxldCB0aGVfYXJncyA9IGFyZ3NbMl07XG5cbiAgICAgIHJldHVybiB0aGlzLmFkZF9wcm9jKG1vZFtmdW5dLCB0aGVfYXJncywgZmFsc2UsIGZhbHNlKS5waWQ7XG4gICAgfVxuICB9XG5cbiAgc3Bhd25fbGluayguLi5hcmdzKXtcbiAgICBpZihhcmdzLmxlbmd0aCA9PT0gMSl7XG4gICAgICBsZXQgZnVuID0gYXJnc1swXTtcbiAgICAgIHJldHVybiB0aGlzLmFkZF9wcm9jKGZ1biwgW10sIHRydWUsIGZhbHNlKS5waWQ7XG5cbiAgICB9ZWxzZXtcbiAgICAgIGxldCBtb2QgPSBhcmdzWzBdO1xuICAgICAgbGV0IGZ1biA9IGFyZ3NbMV07XG4gICAgICBsZXQgdGhlX2FyZ3MgPSBhcmdzWzJdO1xuXG4gICAgICByZXR1cm4gdGhpcy5hZGRfcHJvYyhtb2RbZnVuXSwgdGhlX2FyZ3MsIHRydWUsIGZhbHNlKS5waWQ7XG4gICAgfVxuICB9XG5cbiAgbGluayhwaWQpe1xuICAgIHRoaXMubGlua3MuZ2V0KHRoaXMucGlkKCkpLmFkZChwaWQpO1xuICAgIHRoaXMubGlua3MuZ2V0KHBpZCkuYWRkKHRoaXMucGlkKCkpO1xuICB9XG5cbiAgdW5saW5rKHBpZCl7XG4gICAgdGhpcy5saW5rcy5nZXQodGhpcy5waWQoKSkuZGVsZXRlKHBpZCk7XG4gICAgdGhpcy5saW5rcy5nZXQocGlkKS5kZWxldGUodGhpcy5waWQoKSk7XG4gIH1cblxuICBzcGF3bl9tb25pdG9yKC4uLmFyZ3Mpe1xuICAgIGlmKGFyZ3MubGVuZ3RoID09PSAxKXtcbiAgICAgIGxldCBmdW4gPSBhcmdzWzBdO1xuICAgICAgbGV0IHByb2Nlc3MgPSB0aGlzLmFkZF9wcm9jKGZ1biwgW10sIGZhbHNlLCB0cnVlKTtcbiAgICAgIHJldHVybiBbcHJvY2Vzcy5waWQsIHByb2Nlc3MubW9uaXRvcnNbMF1dO1xuXG4gICAgfWVsc2V7XG4gICAgICBsZXQgbW9kID0gYXJnc1swXTtcbiAgICAgIGxldCBmdW4gPSBhcmdzWzFdO1xuICAgICAgbGV0IHRoZV9hcmdzID0gYXJnc1syXTtcbiAgICAgIGxldCBwcm9jZXNzID0gdGhpcy5hZGRfcHJvYyhtb2RbZnVuXSwgdGhlX2FyZ3MsIGZhbHNlLCB0cnVlKTtcblxuICAgICAgcmV0dXJuIFtwcm9jZXNzLnBpZCwgcHJvY2Vzcy5tb25pdG9yc1swXV07XG4gICAgfVxuICB9XG5cbiAgbW9uaXRvcihwaWQpe1xuICAgIGNvbnN0IHJlYWxfcGlkID0gdGhpcy5waWRvZihwaWQpO1xuICAgIGNvbnN0IHJlZiA9IHRoaXMubWFrZV9yZWYoKTtcblxuICAgIGlmKHJlYWxfcGlkKXtcblxuICAgICAgdGhpcy5tb25pdG9ycy5zZXQocmVmLCB7J21vbml0b3InOiB0aGlzLmN1cnJlbnRfcHJvY2Vzcy5waWQsICdtb25pdGVlJzogcmVhbF9waWR9KTtcbiAgICAgIHRoaXMucGlkcy5nZXQocmVhbF9waWQpLm1vbml0b3JzLnB1c2gocmVmKTtcbiAgICAgIHJldHVybiByZWY7XG4gICAgfWVsc2V7XG4gICAgICB0aGlzLnNlbmQodGhpcy5jdXJyZW50X3Byb2Nlc3MucGlkLCBuZXcgRXJsYW5nVHlwZXMuVHVwbGUoJ0RPV04nLCByZWYsIHBpZCwgcmVhbF9waWQsIFN5bWJvbC5mb3IoJ25vcHJvYycpKSk7XG4gICAgICByZXR1cm4gcmVmO1xuICAgIH1cbiAgfVxuXG4gIGRlbW9uaXRvcihyZWYpe1xuICAgIGlmKHRoaXMubW9uaXRvci5oYXMocmVmKSl7XG4gICAgICB0aGlzLm1vbml0b3IuZGVsZXRlKHJlZik7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBzZXRfY3VycmVudChpZCl7XG4gICAgbGV0IHBpZCA9IHRoaXMucGlkb2YoaWQpO1xuICAgIGlmKHBpZCAhPT0gbnVsbCl7XG4gICAgICB0aGlzLmN1cnJlbnRfcHJvY2VzcyA9IHRoaXMucGlkcy5nZXQocGlkKTtcbiAgICAgIHRoaXMuY3VycmVudF9wcm9jZXNzLnN0YXR1cyA9IFN0YXRlcy5SVU5OSU5HO1xuICAgIH1cbiAgfVxuXG4gIGFkZF9wcm9jKGZ1biwgYXJncywgbGlua2VkLCBtb25pdG9yZWQpe1xuICAgIGxldCBuZXdwaWQgPSBuZXcgRXJsYW5nVHlwZXMuUElEKCk7XG4gICAgbGV0IG1haWxib3ggPSBuZXcgTWFpbGJveCgpO1xuICAgIGxldCBuZXdwcm9jID0gbmV3IFByb2Nlc3MobmV3cGlkLCBmdW4sIGFyZ3MsIG1haWxib3gsIHRoaXMpO1xuXG4gICAgdGhpcy5waWRzLnNldChuZXdwaWQsIG5ld3Byb2MpO1xuICAgIHRoaXMubWFpbGJveGVzLnNldChuZXdwaWQsIG1haWxib3gpO1xuICAgIHRoaXMubGlua3Muc2V0KG5ld3BpZCwgbmV3IFNldCgpKTtcblxuICAgIGlmKGxpbmtlZCl7XG4gICAgICB0aGlzLmxpbmsobmV3cGlkKTtcbiAgICB9XG5cbiAgICBpZihtb25pdG9yZWQpe1xuICAgICAgdGhpcy5tb25pdG9yKG5ld3BpZCk7XG4gICAgfVxuXG4gICAgbmV3cHJvYy5zdGFydCgpO1xuICAgIHJldHVybiBuZXdwcm9jO1xuICB9XG5cbiAgcmVtb3ZlX3Byb2MocGlkLCBleGl0cmVhc29uKXtcbiAgICB0aGlzLnBpZHMuZGVsZXRlKHBpZCk7XG4gICAgdGhpcy51bnJlZ2lzdGVyKHBpZCk7XG4gICAgdGhpcy5zY2hlZHVsZXIucmVtb3ZlUGlkKHBpZCk7XG5cbiAgICBpZih0aGlzLmxpbmtzLmhhcyhwaWQpKXtcbiAgICAgIGZvciAobGV0IGxpbmtwaWQgb2YgdGhpcy5saW5rcy5nZXQocGlkKSkge1xuICAgICAgICB0aGlzLmV4aXQobGlua3BpZCwgZXhpdHJlYXNvbik7XG4gICAgICAgIHRoaXMubGlua3MuZ2V0KGxpbmtwaWQpLmRlbGV0ZShwaWQpO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmxpbmtzLmRlbGV0ZShwaWQpO1xuICAgIH1cbiAgfVxuXG4gIHJlZ2lzdGVyKG5hbWUsIHBpZCl7XG4gICAgaWYoIXRoaXMubmFtZXMuaGFzKG5hbWUpKXtcbiAgICAgIHRoaXMubmFtZXMuc2V0KG5hbWUsIHBpZCk7XG4gICAgfWVsc2V7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJOYW1lIGlzIGFscmVhZHkgcmVnaXN0ZXJlZCB0byBhbm90aGVyIHByb2Nlc3NcIik7XG4gICAgfVxuICB9XG5cbiAgd2hlcmVpcyhuYW1lKXtcbiAgICByZXR1cm4gdGhpcy5uYW1lcy5oYXMobmFtZSkgPyB0aGlzLm5hbWVzLmdldChuYW1lKSA6IG51bGw7XG4gIH1cblxuICByZWdpc3RlcmVkKCl7XG4gICAgcmV0dXJuIHRoaXMubmFtZXMua2V5cygpO1xuICB9XG5cbiAgdW5yZWdpc3RlcihwaWQpe1xuICAgIGZvcihsZXQgbmFtZSBvZiB0aGlzLm5hbWVzLmtleXMoKSl7XG4gICAgICBpZih0aGlzLm5hbWVzLmhhcyhuYW1lKSAmJiB0aGlzLm5hbWVzLmdldChuYW1lKSA9PT0gcGlkKXtcbiAgICAgICAgdGhpcy5uYW1lcy5kZWxldGUobmFtZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcGlkKCl7XG4gICAgcmV0dXJuIHRoaXMuY3VycmVudF9wcm9jZXNzLnBpZDtcbiAgfVxuXG4gIHBpZG9mKGlkKXtcbiAgICBpZiAoaWQgaW5zdGFuY2VvZiBFcmxhbmdUeXBlcy5QSUQpIHtcbiAgICAgICByZXR1cm4gdGhpcy5waWRzLmhhcyhpZCkgPyBpZCA6IG51bGw7XG4gICAgfSBlbHNlIGlmIChpZCBpbnN0YW5jZW9mIFByb2Nlc3MpIHtcbiAgICAgICByZXR1cm4gaWQucGlkO1xuICAgIH0gZWxzZSB7XG4gICAgICAgbGV0IHBpZCA9IHRoaXMud2hlcmVpcyhpZCk7XG4gICAgICAgaWYgKHBpZCA9PT0gbnVsbClcbiAgICAgICAgICB0aHJvdyhcIlByb2Nlc3MgbmFtZSBub3QgcmVnaXN0ZXJlZDogXCIgKyBpZCArIFwiIChcIiArIHR5cGVvZihpZCkgKyBcIilcIik7XG4gICAgICAgcmV0dXJuIHBpZDtcbiAgICB9XG4gIH1cblxuICBzZW5kKGlkLCBtc2cpIHtcbiAgICBjb25zdCBwaWQgPSB0aGlzLnBpZG9mKGlkKTtcblxuICAgIGlmKHBpZCl7XG4gICAgICB0aGlzLm1haWxib3hlcy5nZXQocGlkKS5kZWxpdmVyKG1zZyk7XG5cbiAgICAgIGlmKHRoaXMuc3VzcGVuZGVkLmhhcyhwaWQpKXtcbiAgICAgICAgbGV0IGZ1biA9IHRoaXMuc3VzcGVuZGVkLmdldChwaWQpO1xuICAgICAgICB0aGlzLnN1c3BlbmRlZC5kZWxldGUocGlkKTtcbiAgICAgICAgdGhpcy5zY2hlZHVsZShmdW4pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBtc2c7XG4gIH1cblxuICByZWNlaXZlKGZ1biwgdGltZW91dCA9IDAsIHRpbWVvdXRGbiA9ICgpID0+IHRydWUgKSB7XG4gICAgbGV0IERhdGVUaW1lb3V0ID0gbnVsbDtcblxuICAgIGlmKHRpbWVvdXQgPT09IDAgfHwgdGltZW91dCA9PT0gSW5maW5pdHkpe1xuICAgICAgRGF0ZVRpbWVvdXQgPSBudWxsO1xuICAgIH1lbHNle1xuICAgICAgRGF0ZVRpbWVvdXQgPSBEYXRlLm5vdygpICsgdGltZW91dDtcbiAgICB9XG5cbiAgICByZXR1cm4gW1xuICAgICAgU3RhdGVzLlJFQ0VJVkUsXG4gICAgICBmdW4sXG4gICAgICBEYXRlVGltZW91dCxcbiAgICAgIHRpbWVvdXRGblxuICAgIF07XG4gIH1cblxuICBzbGVlcChkdXJhdGlvbil7XG4gICAgcmV0dXJuIFtTdGF0ZXMuU0xFRVAsIGR1cmF0aW9uXTtcbiAgfVxuXG4gIHN1c3BlbmQoZnVuKXtcbiAgICB0aGlzLmN1cnJlbnRfcHJvY2Vzcy5zdGF0dXMgPSBTdGF0ZXMuU1VTUEVOREVEO1xuICAgIHRoaXMuc3VzcGVuZGVkLnNldCh0aGlzLmN1cnJlbnRfcHJvY2Vzcy5waWQsIGZ1bik7XG4gIH1cblxuICBkZWxheShmdW4sIHRpbWUpe1xuICAgIHRoaXMuY3VycmVudF9wcm9jZXNzLnN0YXR1cyA9IFN0YXRlcy5TTEVFUElORztcblxuICAgIGlmKE51bWJlci5pc0ludGVnZXIodGltZSkpe1xuICAgICAgdGhpcy5zY2hlZHVsZXIuc2NoZWR1bGVGdXR1cmUodGhpcy5jdXJyZW50X3Byb2Nlc3MucGlkLCB0aW1lLCBmdW4pO1xuICAgIH1cbiAgfVxuXG4gIHNjaGVkdWxlKGZ1biwgcGlkKXtcbiAgICBjb25zdCB0aGVfcGlkID0gcGlkICE9IG51bGwgPyBwaWQgOiB0aGlzLmN1cnJlbnRfcHJvY2Vzcy5waWQ7XG4gICAgdGhpcy5zY2hlZHVsZXIuc2NoZWR1bGUodGhlX3BpZCwgZnVuKTtcbiAgfVxuXG4gIGV4aXQob25lLCB0d28pe1xuICAgIGxldCBwaWQgPSBudWxsO1xuICAgIGxldCByZWFzb24gPSBudWxsO1xuICAgIGxldCBwcm9jZXNzID0gbnVsbDtcblxuICAgIGlmKHR3byl7XG4gICAgICBwaWQgPSBvbmU7XG4gICAgICByZWFzb24gPSB0d287XG4gICAgICBwcm9jZXNzID0gdGhpcy5waWRzLmdldCh0aGlzLnBpZG9mKHBpZCkpO1xuXG4gICAgICBpZigocHJvY2VzcyAmJiBwcm9jZXNzLmlzX3RyYXBwaW5nX2V4aXRzKCkpIHx8IHJlYXNvbiA9PT0gU3RhdGVzLktJTEwgfHwgcmVhc29uID09PSBTdGF0ZXMuTk9STUFMKXtcbiAgICAgICAgdGhpcy5tYWlsYm94ZXMuZ2V0KHByb2Nlc3MucGlkKS5kZWxpdmVyKG5ldyBFcmxhbmdUeXBlcy5UdXBsZShTdGF0ZXMuRVhJVCwgdGhpcy5waWQoKSwgcmVhc29uICkpO1xuICAgICAgfSBlbHNle1xuICAgICAgICBwcm9jZXNzLnNpZ25hbChyZWFzb24pO1xuICAgICAgfVxuXG4gICAgfWVsc2V7XG4gICAgICBwaWQgPSB0aGlzLmN1cnJlbnRfcHJvY2Vzcy5waWQ7XG4gICAgICByZWFzb24gPSBvbmU7XG4gICAgICBwcm9jZXNzID0gdGhpcy5jdXJyZW50X3Byb2Nlc3M7XG5cbiAgICAgIHByb2Nlc3Muc2lnbmFsKHJlYXNvbik7XG4gICAgfVxuXG4gICAgZm9yKGxldCByZWYgaW4gcHJvY2Vzcy5tb25pdG9ycyl7XG4gICAgICBsZXQgbW9ucyA9IHRoaXMubW9uaXRvcnMuZ2V0KHJlZik7XG4gICAgICB0aGlzLnNlbmQobW9uc1snbW9uaXRvciddLCBuZXcgRXJsYW5nVHlwZXMuVHVwbGUoJ0RPV04nLCByZWYsIG1vbnNbJ21vbml0ZWUnXSwgbW9uc1snbW9uaXRlZSddLCByZWFzb24pKTtcbiAgICB9XG4gIH1cblxuICBlcnJvcihyZWFzb24pe1xuICAgIHRoaXMuY3VycmVudF9wcm9jZXNzLnNpZ25hbChyZWFzb24pO1xuICB9XG5cbiAgcHJvY2Vzc19mbGFnKC4uLmFyZ3Mpe1xuICAgIGlmKGFyZ3MubGVuZ3RoID09IDIpe1xuICAgICAgY29uc3QgZmxhZyA9IGFyZ3NbMF07XG4gICAgICBjb25zdCB2YWx1ZSA9IGFyZ3NbMV07XG4gICAgICByZXR1cm4gdGhpcy5jdXJyZW50X3Byb2Nlc3MucHJvY2Vzc19mbGFnKGZsYWcsIHZhbHVlKTtcbiAgICB9ZWxzZXtcbiAgICAgIGNvbnN0IHBpZCA9IHRoaXMucGlkb2YoYXJnc1swXSk7XG4gICAgICBjb25zdCBmbGFnID0gYXJnc1sxXTtcbiAgICAgIGNvbnN0IHZhbHVlID0gYXJnc1syXTtcbiAgICAgIHJldHVybiB0aGlzLnBpZHMuZ2V0KHBpZCkucHJvY2Vzc19mbGFnKGZsYWcsIHZhbHVlKTtcbiAgICB9XG4gIH1cblxuICBwdXQoa2V5LCB2YWx1ZSl7XG4gICAgdGhpcy5jdXJyZW50X3Byb2Nlc3MuZGljdFtrZXldID0gdmFsdWU7XG4gIH1cblxuICBnZXRfcHJvY2Vzc19kaWN0KCl7XG4gICAgcmV0dXJuIHRoaXMuY3VycmVudF9wcm9jZXNzLmRpY3Q7XG4gIH1cblxuICBnZXQoa2V5LCBkZWZhdWx0X3ZhbHVlID0gbnVsbCl7XG4gICAgaWYoa2V5IGluIHRoaXMuY3VycmVudF9wcm9jZXNzLmRpY3Qpe1xuICAgICAgcmV0dXJuIHRoaXMuY3VycmVudF9wcm9jZXNzLmRpY3Rba2V5XTtcbiAgICB9ZWxzZXtcbiAgICAgIHJldHVybiBkZWZhdWx0X3ZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIGdldF9rZXlzKHZhbHVlKXtcbiAgICBpZih2YWx1ZSl7XG4gICAgICBsZXQga2V5cyA9IFtdO1xuXG4gICAgICBmb3IobGV0IGtleSBvZiBPYmplY3Qua2V5cyh0aGlzLmN1cnJlbnRfcHJvY2Vzcy5kaWN0KSl7XG4gICAgICAgIGlmKHRoaXMuY3VycmVudF9wcm9jZXNzLmRpY3Rba2V5XSA9PT0gdmFsdWUpe1xuICAgICAgICAgIGtleXMucHVzaChrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBrZXlzO1xuICAgIH1cblxuICAgIHJldHVybiBPYmplY3Qua2V5cyh0aGlzLmN1cnJlbnRfcHJvY2Vzcy5kaWN0KTtcbiAgfVxuXG4gIGVyYXNlKGtleSl7XG4gICAgaWYoa2V5ICE9IG51bGwpe1xuICAgICAgZGVsZXRlIHRoaXMuY3VycmVudF9wcm9jZXNzLmRpY3Rba2V5XTtcbiAgICB9ZWxzZXtcbiAgICAgIHRoaXMuY3VycmVudF9wcm9jZXNzLmRpY3QgPSB7fTtcbiAgICB9XG4gIH1cblxuICBpc19hbGl2ZShwaWQpe1xuICAgIGNvbnN0IHJlYWxfcGlkID0gdGhpcy5waWRvZihwaWQpO1xuICAgIHJldHVybiByZWFsX3BpZCAhPSBudWxsO1xuICB9XG5cbiAgbGlzdCgpe1xuICAgIHJldHVybiBBcnJheS5mcm9tKHRoaXMucGlkcy5rZXlzKCkpO1xuICB9XG5cbiAgbWFrZV9yZWYoKXtcbiAgICByZXR1cm4gbmV3IEVybGFuZ1R5cGVzLlJlZmVyZW5jZSgpO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFByb2Nlc3NTeXN0ZW07XG4iLCJpbXBvcnQgUHJvY2Vzc1N5c3RlbSBmcm9tIFwiLi9wcm9jZXNzZXMvcHJvY2Vzc19zeXN0ZW1cIjtcblxuZXhwb3J0IGRlZmF1bHQge1xuICBQcm9jZXNzU3lzdGVtXG59O1xuIiwiLyogQGZsb3cgKi9cblxuY2xhc3MgVmFyaWFibGUge1xuXG4gIGNvbnN0cnVjdG9yKGRlZmF1bHRfdmFsdWUgPSBTeW1ib2wuZm9yKFwidGFpbG9yZWQubm9fdmFsdWVcIikpIHtcbiAgICB0aGlzLmRlZmF1bHRfdmFsdWUgPSBkZWZhdWx0X3ZhbHVlO1xuICB9XG59XG5cbmNsYXNzIFdpbGRjYXJkIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gIH1cbn1cblxuY2xhc3MgU3RhcnRzV2l0aCB7XG5cbiAgY29uc3RydWN0b3IocHJlZml4KSB7XG4gICAgdGhpcy5wcmVmaXggPSBwcmVmaXg7XG4gIH1cbn1cblxuY2xhc3MgQ2FwdHVyZSB7XG5cbiAgY29uc3RydWN0b3IodmFsdWUpIHtcbiAgICB0aGlzLnZhbHVlID0gdmFsdWU7XG4gIH1cbn1cblxuY2xhc3MgSGVhZFRhaWwge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgfVxufVxuXG5jbGFzcyBUeXBlIHtcblxuICBjb25zdHJ1Y3Rvcih0eXBlLCBvYmpQYXR0ZXJuID0ge30pIHtcbiAgICB0aGlzLnR5cGUgPSB0eXBlO1xuICAgIHRoaXMub2JqUGF0dGVybiA9IG9ialBhdHRlcm47XG4gIH1cbn1cblxuY2xhc3MgQm91bmQge1xuXG4gIGNvbnN0cnVjdG9yKHZhbHVlKSB7XG4gICAgdGhpcy52YWx1ZSA9IHZhbHVlO1xuICB9XG59XG5cbmNsYXNzIEJpdFN0cmluZ01hdGNoIHtcblxuICBjb25zdHJ1Y3RvciguLi52YWx1ZXMpe1xuICAgIHRoaXMudmFsdWVzID0gdmFsdWVzO1xuICB9XG5cbiAgbGVuZ3RoKCkge1xuICAgIHJldHVybiB2YWx1ZXMubGVuZ3RoO1xuICB9XG5cbiAgYml0X3NpemUoKSB7XG4gICAgcmV0dXJuIHRoaXMuYnl0ZV9zaXplKCkgKiA4O1xuICB9XG5cbiAgYnl0ZV9zaXplKCl7XG4gICAgbGV0IHMgPSAwO1xuXG4gICAgZm9yKGxldCB2YWwgb2YgdGhpcy52YWx1ZXMpe1xuICAgICAgcyA9IHMgKyAoKHZhbC51bml0ICogdmFsLnNpemUpLzgpO1xuICAgIH1cblxuICAgIHJldHVybiBzO1xuICB9XG5cbiAgZ2V0VmFsdWUoaW5kZXgpe1xuICAgIHJldHVybiB0aGlzLnZhbHVlcyhpbmRleCk7XG4gIH1cblxuICBnZXRTaXplT2ZWYWx1ZShpbmRleCl7XG4gICAgbGV0IHZhbCA9IHRoaXMuZ2V0VmFsdWUoaW5kZXgpO1xuICAgIHJldHVybiB2YWwudW5pdCAqIHZhbC5zaXplO1xuICB9XG5cbiAgZ2V0VHlwZU9mVmFsdWUoaW5kZXgpe1xuICAgIHJldHVybiB0aGlzLmdldFZhbHVlKGluZGV4KS50eXBlO1xuICB9XG59XG5cbmZ1bmN0aW9uIHZhcmlhYmxlKGRlZmF1bHRfdmFsdWUgPSBTeW1ib2wuZm9yKFwidGFpbG9yZWQubm9fdmFsdWVcIikpIHtcbiAgcmV0dXJuIG5ldyBWYXJpYWJsZShkZWZhdWx0X3ZhbHVlKTtcbn1cblxuZnVuY3Rpb24gd2lsZGNhcmQoKSB7XG4gIHJldHVybiBuZXcgV2lsZGNhcmQoKTtcbn1cblxuZnVuY3Rpb24gc3RhcnRzV2l0aChwcmVmaXgpIHtcbiAgcmV0dXJuIG5ldyBTdGFydHNXaXRoKHByZWZpeCk7XG59XG5cbmZ1bmN0aW9uIGNhcHR1cmUodmFsdWUpIHtcbiAgcmV0dXJuIG5ldyBDYXB0dXJlKHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gaGVhZFRhaWwoKSB7XG4gIHJldHVybiBuZXcgSGVhZFRhaWwoKTtcbn1cblxuZnVuY3Rpb24gdHlwZSh0eXBlLCBvYmpQYXR0ZXJuID0ge30pIHtcbiAgcmV0dXJuIG5ldyBUeXBlKHR5cGUsIG9ialBhdHRlcm4pO1xufVxuXG5mdW5jdGlvbiBib3VuZCh2YWx1ZSkge1xuICByZXR1cm4gbmV3IEJvdW5kKHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gYml0U3RyaW5nTWF0Y2goLi4udmFsdWVzKXtcbiAgcmV0dXJuIG5ldyBCaXRTdHJpbmdNYXRjaCguLi52YWx1ZXMpO1xufVxuXG5leHBvcnQge1xuICBWYXJpYWJsZSxcbiAgV2lsZGNhcmQsXG4gIFN0YXJ0c1dpdGgsXG4gIENhcHR1cmUsXG4gIEhlYWRUYWlsLFxuICBUeXBlLFxuICBCb3VuZCxcbiAgQml0U3RyaW5nTWF0Y2gsXG4gIHZhcmlhYmxlLFxuICB3aWxkY2FyZCxcbiAgc3RhcnRzV2l0aCxcbiAgY2FwdHVyZSxcbiAgaGVhZFRhaWwsXG4gIHR5cGUsXG4gIGJvdW5kLFxuICBiaXRTdHJpbmdNYXRjaFxufTtcbiIsIi8qIEBmbG93ICovXG5cbmltcG9ydCB7IFZhcmlhYmxlLCBXaWxkY2FyZCwgSGVhZFRhaWwsIENhcHR1cmUsIFR5cGUsIFN0YXJ0c1dpdGgsIEJvdW5kLCBCaXRTdHJpbmdNYXRjaCB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmZ1bmN0aW9uIGlzX251bWJlcih2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gaXNfc3RyaW5nKHZhbHVlKXtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZyc7XG59XG5cbmZ1bmN0aW9uIGlzX2Jvb2xlYW4odmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nO1xufVxuXG5mdW5jdGlvbiBpc19zeW1ib2wodmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N5bWJvbCc7XG59XG5cbmZ1bmN0aW9uIGlzX251bGwodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlID09PSBudWxsO1xufVxuXG5mdW5jdGlvbiBpc191bmRlZmluZWQodmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCc7XG59XG5cbmZ1bmN0aW9uIGlzX2Z1bmN0aW9uKHZhbHVlKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpID09ICdbb2JqZWN0IEZ1bmN0aW9uXSc7XG59XG5cbmZ1bmN0aW9uIGlzX3ZhcmlhYmxlKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSBpbnN0YW5jZW9mIFZhcmlhYmxlO1xufVxuXG5mdW5jdGlvbiBpc193aWxkY2FyZCh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgaW5zdGFuY2VvZiBXaWxkY2FyZDtcbn1cblxuZnVuY3Rpb24gaXNfaGVhZFRhaWwodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgSGVhZFRhaWw7XG59XG5cbmZ1bmN0aW9uIGlzX2NhcHR1cmUodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgQ2FwdHVyZTtcbn1cblxuZnVuY3Rpb24gaXNfdHlwZSh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgaW5zdGFuY2VvZiBUeXBlO1xufVxuXG5mdW5jdGlvbiBpc19zdGFydHNXaXRoKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSBpbnN0YW5jZW9mIFN0YXJ0c1dpdGg7XG59XG5cbmZ1bmN0aW9uIGlzX2JvdW5kKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSBpbnN0YW5jZW9mIEJvdW5kO1xufVxuXG5mdW5jdGlvbiBpc19vYmplY3QodmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCc7XG59XG5cbmZ1bmN0aW9uIGlzX2FycmF5KHZhbHVlKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gaXNfYml0c3RyaW5nKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSBpbnN0YW5jZW9mIEJpdFN0cmluZ01hdGNoO1xufVxuXG5leHBvcnQge1xuICBpc19udW1iZXIsXG4gIGlzX3N0cmluZyxcbiAgaXNfYm9vbGVhbixcbiAgaXNfc3ltYm9sLFxuICBpc19udWxsLFxuICBpc191bmRlZmluZWQsXG4gIGlzX2Z1bmN0aW9uLFxuICBpc192YXJpYWJsZSxcbiAgaXNfd2lsZGNhcmQsXG4gIGlzX2hlYWRUYWlsLFxuICBpc19jYXB0dXJlLFxuICBpc190eXBlLFxuICBpc19zdGFydHNXaXRoLFxuICBpc19ib3VuZCxcbiAgaXNfb2JqZWN0LFxuICBpc19hcnJheSxcbiAgaXNfYml0c3RyaW5nXG59O1xuIiwiLyogQGZsb3cgKi9cblxuaW1wb3J0ICogYXMgQ2hlY2tzIGZyb20gXCIuL2NoZWNrc1wiO1xuaW1wb3J0ICogYXMgVHlwZXMgZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IGJ1aWxkTWF0Y2ggfSBmcm9tIFwiLi9tYXRjaFwiO1xuaW1wb3J0IEVybGFuZ1R5cGVzIGZyb20gXCJlcmxhbmctdHlwZXNcIjtcbmNvbnN0IEJpdFN0cmluZyA9IEVybGFuZ1R5cGVzLkJpdFN0cmluZztcblxuZnVuY3Rpb24gcmVzb2x2ZVN5bWJvbChwYXR0ZXJuKXtcbiAgcmV0dXJuIGZ1bmN0aW9uKHZhbHVlKXtcbiAgICByZXR1cm4gQ2hlY2tzLmlzX3N5bWJvbCh2YWx1ZSkgJiYgdmFsdWUgPT09IHBhdHRlcm47XG4gIH07XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVTdHJpbmcocGF0dGVybil7XG4gIHJldHVybiBmdW5jdGlvbih2YWx1ZSl7XG4gICAgcmV0dXJuIENoZWNrcy5pc19zdHJpbmcodmFsdWUpICYmIHZhbHVlID09PSBwYXR0ZXJuO1xuICB9O1xufVxuXG5mdW5jdGlvbiByZXNvbHZlTnVtYmVyKHBhdHRlcm4pe1xuICByZXR1cm4gZnVuY3Rpb24odmFsdWUpe1xuICAgIHJldHVybiBDaGVja3MuaXNfbnVtYmVyKHZhbHVlKSAmJiB2YWx1ZSA9PT0gcGF0dGVybjtcbiAgfTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUJvb2xlYW4ocGF0dGVybil7XG4gIHJldHVybiBmdW5jdGlvbih2YWx1ZSl7XG4gICAgcmV0dXJuIENoZWNrcy5pc19ib29sZWFuKHZhbHVlKSAmJiB2YWx1ZSA9PT0gcGF0dGVybjtcbiAgfTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUZ1bmN0aW9uKHBhdHRlcm4pe1xuICByZXR1cm4gZnVuY3Rpb24odmFsdWUpe1xuICAgIHJldHVybiBDaGVja3MuaXNfZnVuY3Rpb24odmFsdWUpICYmIHZhbHVlID09PSBwYXR0ZXJuO1xuICB9O1xufVxuXG5mdW5jdGlvbiByZXNvbHZlTnVsbChwYXR0ZXJuKXtcbiAgcmV0dXJuIGZ1bmN0aW9uKHZhbHVlKXtcbiAgICByZXR1cm4gQ2hlY2tzLmlzX251bGwodmFsdWUpO1xuICB9O1xufVxuXG5mdW5jdGlvbiByZXNvbHZlQm91bmQocGF0dGVybil7XG4gIHJldHVybiBmdW5jdGlvbih2YWx1ZSwgYXJncyl7XG4gICAgaWYodHlwZW9mIHZhbHVlID09PSB0eXBlb2YgcGF0dGVybi52YWx1ZSAmJiB2YWx1ZSA9PT0gcGF0dGVybi52YWx1ZSl7XG4gICAgICBhcmdzLnB1c2godmFsdWUpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9O1xufVxuXG5mdW5jdGlvbiByZXNvbHZlV2lsZGNhcmQoKXtcbiAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9O1xufVxuXG5mdW5jdGlvbiByZXNvbHZlVmFyaWFibGUoKXtcbiAgcmV0dXJuIGZ1bmN0aW9uKHZhbHVlLCBhcmdzKXtcbiAgICBhcmdzLnB1c2godmFsdWUpO1xuICAgIHJldHVybiB0cnVlO1xuICB9O1xufVxuXG5mdW5jdGlvbiByZXNvbHZlSGVhZFRhaWwoKSB7XG4gIHJldHVybiBmdW5jdGlvbih2YWx1ZSwgYXJncykge1xuICAgIGlmKCFDaGVja3MuaXNfYXJyYXkodmFsdWUpIHx8IHZhbHVlLmxlbmd0aCA8IDIpe1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IGhlYWQgPSB2YWx1ZVswXTtcbiAgICBjb25zdCB0YWlsID0gdmFsdWUuc2xpY2UoMSk7XG5cbiAgICBhcmdzLnB1c2goaGVhZCk7XG4gICAgYXJncy5wdXNoKHRhaWwpO1xuXG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVDYXB0dXJlKHBhdHRlcm4pIHtcbiAgY29uc3QgbWF0Y2hlcyA9IGJ1aWxkTWF0Y2gocGF0dGVybi52YWx1ZSk7XG5cbiAgcmV0dXJuIGZ1bmN0aW9uKHZhbHVlLCBhcmdzKSB7XG4gICAgaWYobWF0Y2hlcyh2YWx1ZSwgYXJncykpe1xuICAgICAgYXJncy5wdXNoKHZhbHVlKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZVN0YXJ0c1dpdGgocGF0dGVybikge1xuICBjb25zdCBwcmVmaXggPSBwYXR0ZXJuLnByZWZpeDtcblxuICByZXR1cm4gZnVuY3Rpb24odmFsdWUsIGFyZ3MpIHtcbiAgICBpZihDaGVja3MuaXNfc3RyaW5nKHZhbHVlKSAmJiB2YWx1ZS5zdGFydHNXaXRoKHByZWZpeCkpe1xuICAgICAgYXJncy5wdXNoKHZhbHVlLnN1YnN0cmluZyhwcmVmaXgubGVuZ3RoKSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVUeXBlKHBhdHRlcm4pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKHZhbHVlLCBhcmdzKSB7XG4gICAgaWYodmFsdWUgaW5zdGFuY2VvZiBwYXR0ZXJuLnR5cGUpe1xuICAgICAgY29uc3QgbWF0Y2hlcyA9IGJ1aWxkTWF0Y2gocGF0dGVybi5vYmpQYXR0ZXJuKTtcbiAgICAgIHJldHVybiBtYXRjaGVzKHZhbHVlLCBhcmdzKSAmJiBhcmdzLnB1c2godmFsdWUpID4gMDtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVBcnJheShwYXR0ZXJuKSB7XG4gIGNvbnN0IG1hdGNoZXMgPSBwYXR0ZXJuLm1hcCh4ID0+IGJ1aWxkTWF0Y2goeCkpO1xuXG4gIHJldHVybiBmdW5jdGlvbih2YWx1ZSwgYXJncykge1xuICAgIGlmKCFDaGVja3MuaXNfYXJyYXkodmFsdWUpIHx8IHZhbHVlLmxlbmd0aCAhPSBwYXR0ZXJuLmxlbmd0aCl7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhbHVlLmV2ZXJ5KGZ1bmN0aW9uKHYsIGkpIHtcbiAgICAgIHJldHVybiBtYXRjaGVzW2ldKHZhbHVlW2ldLCBhcmdzKTtcbiAgICB9KTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZU9iamVjdChwYXR0ZXJuKSB7XG4gIGxldCBtYXRjaGVzID0ge307XG5cbiAgZm9yKGxldCBrZXkgb2YgT2JqZWN0LmtleXMocGF0dGVybikuY29uY2F0KE9iamVjdC5nZXRPd25Qcm9wZXJ0eVN5bWJvbHMocGF0dGVybikpKXtcbiAgICBtYXRjaGVzW2tleV0gPSBidWlsZE1hdGNoKHBhdHRlcm5ba2V5XSk7XG4gIH1cblxuICByZXR1cm4gZnVuY3Rpb24odmFsdWUsIGFyZ3MpIHtcbiAgICBpZighQ2hlY2tzLmlzX29iamVjdCh2YWx1ZSkgfHwgcGF0dGVybi5sZW5ndGggPiB2YWx1ZS5sZW5ndGgpe1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZvcihsZXQga2V5IG9mIE9iamVjdC5rZXlzKHBhdHRlcm4pLmNvbmNhdChPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKHBhdHRlcm4pKSl7XG4gICAgICBpZighKGtleSBpbiB2YWx1ZSkgfHwgIW1hdGNoZXNba2V5XSh2YWx1ZVtrZXldLCBhcmdzKSApe1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVCaXRTdHJpbmcocGF0dGVybikge1xuICBsZXQgcGF0dGVybkJpdFN0cmluZyA9IFtdO1xuXG4gIGZvcihsZXQgYml0c3RyaW5nTWF0Y2hQYXJ0IG9mIHBhdHRlcm4udmFsdWVzKXtcbiAgICBpZihDaGVja3MuaXNfdmFyaWFibGUoYml0c3RyaW5nTWF0Y2hQYXJ0LnZhbHVlKSl7XG4gICAgICBsZXQgc2l6ZSA9IGdldFNpemUoYml0c3RyaW5nTWF0Y2hQYXJ0LnVuaXQsIGJpdHN0cmluZ01hdGNoUGFydC5zaXplKTtcbiAgICAgIGZpbGxBcnJheShwYXR0ZXJuQml0U3RyaW5nLCBzaXplKTtcbiAgICB9ZWxzZXtcbiAgICAgIHBhdHRlcm5CaXRTdHJpbmcgPSBwYXR0ZXJuQml0U3RyaW5nLmNvbmNhdChuZXcgQml0U3RyaW5nKGJpdHN0cmluZ01hdGNoUGFydCkudmFsdWUpO1xuICAgIH1cbiAgfVxuXG4gIGxldCBwYXR0ZXJuVmFsdWVzID0gcGF0dGVybi52YWx1ZXM7XG5cbiAgcmV0dXJuIGZ1bmN0aW9uKHZhbHVlLCBhcmdzKSB7XG4gICAgbGV0IGJzVmFsdWUgPSBudWxsO1xuXG4gICAgaWYoIUNoZWNrcy5pc19zdHJpbmcodmFsdWUpICYmICEodmFsdWUgaW5zdGFuY2VvZiBCaXRTdHJpbmcpICl7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYoQ2hlY2tzLmlzX3N0cmluZyh2YWx1ZSkpe1xuICAgICAgYnNWYWx1ZSA9IG5ldyBCaXRTdHJpbmcoQml0U3RyaW5nLmJpbmFyeSh2YWx1ZSkpO1xuICAgIH1lbHNle1xuICAgICAgYnNWYWx1ZSA9IHZhbHVlO1xuICAgIH1cblxuICAgIGxldCBiZWdpbm5pbmdJbmRleCA9IDA7XG5cbiAgICBmb3IobGV0IGkgPSAwOyBpIDwgcGF0dGVyblZhbHVlcy5sZW5ndGg7IGkrKyl7XG4gICAgICBsZXQgYml0c3RyaW5nTWF0Y2hQYXJ0ID0gcGF0dGVyblZhbHVlc1tpXTtcblxuICAgICAgaWYoQ2hlY2tzLmlzX3ZhcmlhYmxlKGJpdHN0cmluZ01hdGNoUGFydC52YWx1ZSkgJiZcbiAgICAgICAgIGJpdHN0cmluZ01hdGNoUGFydC50eXBlID09ICdiaW5hcnknICYmXG4gICAgICAgICBiaXRzdHJpbmdNYXRjaFBhcnQuc2l6ZSA9PT0gdW5kZWZpbmVkICYmXG4gICAgICAgICBpIDwgcGF0dGVyblZhbHVlcy5sZW5ndGggLSAxKXtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiYSBiaW5hcnkgZmllbGQgd2l0aG91dCBzaXplIGlzIG9ubHkgYWxsb3dlZCBhdCB0aGUgZW5kIG9mIGEgYmluYXJ5IHBhdHRlcm5cIik7XG4gICAgICB9XG5cbiAgICAgIGxldCBzaXplID0gMDtcbiAgICAgIGxldCBic1ZhbHVlQXJyYXlQYXJ0ID0gW107XG4gICAgICBsZXQgcGF0dGVybkJpdFN0cmluZ0FycmF5UGFydCA9IFtdO1xuICAgICAgc2l6ZSA9IGdldFNpemUoYml0c3RyaW5nTWF0Y2hQYXJ0LnVuaXQsIGJpdHN0cmluZ01hdGNoUGFydC5zaXplKTtcblxuICAgICAgaWYoaSA9PT0gcGF0dGVyblZhbHVlcy5sZW5ndGggLSAxKXtcbiAgICAgICAgYnNWYWx1ZUFycmF5UGFydCA9IGJzVmFsdWUudmFsdWUuc2xpY2UoYmVnaW5uaW5nSW5kZXgpO1xuICAgICAgICBwYXR0ZXJuQml0U3RyaW5nQXJyYXlQYXJ0ID0gcGF0dGVybkJpdFN0cmluZy5zbGljZShiZWdpbm5pbmdJbmRleCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBic1ZhbHVlQXJyYXlQYXJ0ID0gYnNWYWx1ZS52YWx1ZS5zbGljZShiZWdpbm5pbmdJbmRleCwgYmVnaW5uaW5nSW5kZXggKyBzaXplKTtcbiAgICAgICAgcGF0dGVybkJpdFN0cmluZ0FycmF5UGFydCA9IHBhdHRlcm5CaXRTdHJpbmcuc2xpY2UoYmVnaW5uaW5nSW5kZXgsIGJlZ2lubmluZ0luZGV4ICsgc2l6ZSk7XG4gICAgICB9XG5cbiAgICAgIGlmKENoZWNrcy5pc192YXJpYWJsZShiaXRzdHJpbmdNYXRjaFBhcnQudmFsdWUpKXtcbiAgICAgICAgc3dpdGNoKGJpdHN0cmluZ01hdGNoUGFydC50eXBlKSB7XG4gICAgICAgIGNhc2UgJ2ludGVnZXInOlxuICAgICAgICAgIGlmKGJpdHN0cmluZ01hdGNoUGFydC5hdHRyaWJ1dGVzICYmIGJpdHN0cmluZ01hdGNoUGFydC5hdHRyaWJ1dGVzLmluZGV4T2YoXCJzaWduZWRcIikgIT0gLTEpe1xuICAgICAgICAgICAgYXJncy5wdXNoKG5ldyBJbnQ4QXJyYXkoW2JzVmFsdWVBcnJheVBhcnRbMF1dKVswXSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFyZ3MucHVzaChuZXcgVWludDhBcnJheShbYnNWYWx1ZUFycmF5UGFydFswXV0pWzBdKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnZmxvYXQnOlxuICAgICAgICAgIGlmKHNpemUgPT09IDY0KXtcbiAgICAgICAgICAgIGFyZ3MucHVzaChGbG9hdDY0QXJyYXkuZnJvbShic1ZhbHVlQXJyYXlQYXJ0KVswXSk7XG4gICAgICAgICAgfSBlbHNlIGlmKHNpemUgPT09IDMyKXtcbiAgICAgICAgICAgIGFyZ3MucHVzaChGbG9hdDMyQXJyYXkuZnJvbShic1ZhbHVlQXJyYXlQYXJ0KVswXSk7XG4gICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ2JpdHN0cmluZyc6XG4gICAgICAgICAgYXJncy5wdXNoKGNyZWF0ZUJpdFN0cmluZyhic1ZhbHVlQXJyYXlQYXJ0KSk7XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgICAgICBhcmdzLnB1c2goU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBuZXcgVWludDhBcnJheShic1ZhbHVlQXJyYXlQYXJ0KSkpO1xuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ3V0ZjgnOlxuICAgICAgICAgIGFyZ3MucHVzaChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIG5ldyBVaW50OEFycmF5KGJzVmFsdWVBcnJheVBhcnQpKSk7XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAndXRmMTYnOlxuICAgICAgICAgIGFyZ3MucHVzaChTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIG5ldyBVaW50MTZBcnJheShic1ZhbHVlQXJyYXlQYXJ0KSkpO1xuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgJ3V0ZjMyJzpcbiAgICAgICAgICBhcmdzLnB1c2goU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBuZXcgVWludDMyQXJyYXkoYnNWYWx1ZUFycmF5UGFydCkpKTtcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfWVsc2UgaWYoIWFycmF5c0VxdWFsKGJzVmFsdWVBcnJheVBhcnQsIHBhdHRlcm5CaXRTdHJpbmdBcnJheVBhcnQpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgYmVnaW5uaW5nSW5kZXggPSBiZWdpbm5pbmdJbmRleCArIHNpemU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cbn1cblxuZnVuY3Rpb24gZ2V0U2l6ZSh1bml0LCBzaXplKXtcbiAgcmV0dXJuICh1bml0ICogc2l6ZSkgLyA4O1xufVxuXG5mdW5jdGlvbiBhcnJheXNFcXVhbChhLCBiKSB7XG4gIGlmIChhID09PSBiKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKGEgPT0gbnVsbCB8fCBiID09IG51bGwpIHJldHVybiBmYWxzZTtcbiAgaWYgKGEubGVuZ3RoICE9IGIubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhLmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKGFbaV0gIT09IGJbaV0pIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBmaWxsQXJyYXkoYXJyLCBudW0pe1xuICBmb3IobGV0IGkgPSAwOyBpIDwgbnVtOyBpKyspe1xuICAgIGFyci5wdXNoKDApO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJpdFN0cmluZyhhcnIpe1xuICBsZXQgaW50ZWdlclBhcnRzID0gYXJyLm1hcCgoZWxlbSkgPT4gQml0U3RyaW5nLmludGVnZXIoZWxlbSkpO1xuICByZXR1cm4gbmV3IEJpdFN0cmluZyguLi5pbnRlZ2VyUGFydHMpO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlTm9NYXRjaCgpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcbn1cblxuZXhwb3J0IHtcbiAgcmVzb2x2ZUJvdW5kLFxuICByZXNvbHZlV2lsZGNhcmQsXG4gIHJlc29sdmVWYXJpYWJsZSxcbiAgcmVzb2x2ZUhlYWRUYWlsLFxuICByZXNvbHZlQ2FwdHVyZSxcbiAgcmVzb2x2ZVN0YXJ0c1dpdGgsXG4gIHJlc29sdmVUeXBlLFxuICByZXNvbHZlQXJyYXksXG4gIHJlc29sdmVPYmplY3QsXG4gIHJlc29sdmVOb01hdGNoLFxuICByZXNvbHZlU3ltYm9sLFxuICByZXNvbHZlU3RyaW5nLFxuICByZXNvbHZlTnVtYmVyLFxuICByZXNvbHZlQm9vbGVhbixcbiAgcmVzb2x2ZUZ1bmN0aW9uLFxuICByZXNvbHZlTnVsbCxcbiAgcmVzb2x2ZUJpdFN0cmluZ1xufTtcbiIsIi8qIEBmbG93ICovXG5pbXBvcnQgKiBhcyBDaGVja3MgZnJvbSBcIi4vY2hlY2tzXCI7XG5pbXBvcnQgKiBhcyBSZXNvbHZlcnMgZnJvbSBcIi4vcmVzb2x2ZXJzXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZE1hdGNoKHBhdHRlcm4pIHtcblxuICBpZihDaGVja3MuaXNfdmFyaWFibGUocGF0dGVybikpe1xuICAgIHJldHVybiBSZXNvbHZlcnMucmVzb2x2ZVZhcmlhYmxlKHBhdHRlcm4pO1xuICB9XG5cbiAgaWYoQ2hlY2tzLmlzX3dpbGRjYXJkKHBhdHRlcm4pKXtcbiAgICByZXR1cm4gUmVzb2x2ZXJzLnJlc29sdmVXaWxkY2FyZChwYXR0ZXJuKTtcbiAgfVxuXG4gIGlmKENoZWNrcy5pc191bmRlZmluZWQocGF0dGVybikpe1xuICAgIHJldHVybiBSZXNvbHZlcnMucmVzb2x2ZVdpbGRjYXJkKHBhdHRlcm4pO1xuICB9XG5cbiAgaWYoQ2hlY2tzLmlzX2hlYWRUYWlsKHBhdHRlcm4pKXtcbiAgICByZXR1cm4gUmVzb2x2ZXJzLnJlc29sdmVIZWFkVGFpbChwYXR0ZXJuKTtcbiAgfVxuXG4gIGlmKENoZWNrcy5pc19zdGFydHNXaXRoKHBhdHRlcm4pKXtcbiAgICByZXR1cm4gUmVzb2x2ZXJzLnJlc29sdmVTdGFydHNXaXRoKHBhdHRlcm4pO1xuICB9XG5cbiAgaWYoQ2hlY2tzLmlzX2NhcHR1cmUocGF0dGVybikpe1xuICAgIHJldHVybiBSZXNvbHZlcnMucmVzb2x2ZUNhcHR1cmUocGF0dGVybik7XG4gIH1cblxuICBpZihDaGVja3MuaXNfYm91bmQocGF0dGVybikpe1xuICAgIHJldHVybiBSZXNvbHZlcnMucmVzb2x2ZUJvdW5kKHBhdHRlcm4pO1xuICB9XG5cbiAgaWYoQ2hlY2tzLmlzX3R5cGUocGF0dGVybikpe1xuICAgIHJldHVybiBSZXNvbHZlcnMucmVzb2x2ZVR5cGUocGF0dGVybik7XG4gIH1cblxuICBpZihDaGVja3MuaXNfYXJyYXkocGF0dGVybikpe1xuICAgIHJldHVybiBSZXNvbHZlcnMucmVzb2x2ZUFycmF5KHBhdHRlcm4pO1xuICB9XG5cbiAgaWYoQ2hlY2tzLmlzX251bWJlcihwYXR0ZXJuKSl7XG4gICAgcmV0dXJuIFJlc29sdmVycy5yZXNvbHZlTnVtYmVyKHBhdHRlcm4pO1xuICB9XG5cbiAgaWYoQ2hlY2tzLmlzX3N0cmluZyhwYXR0ZXJuKSl7XG4gICAgcmV0dXJuIFJlc29sdmVycy5yZXNvbHZlU3RyaW5nKHBhdHRlcm4pO1xuICB9XG5cbiAgaWYoQ2hlY2tzLmlzX2Jvb2xlYW4ocGF0dGVybikpe1xuICAgIHJldHVybiBSZXNvbHZlcnMucmVzb2x2ZUJvb2xlYW4ocGF0dGVybik7XG4gIH1cblxuICBpZihDaGVja3MuaXNfc3ltYm9sKHBhdHRlcm4pKXtcbiAgICByZXR1cm4gUmVzb2x2ZXJzLnJlc29sdmVTeW1ib2wocGF0dGVybik7XG4gIH1cblxuICBpZihDaGVja3MuaXNfbnVsbChwYXR0ZXJuKSl7XG4gICAgcmV0dXJuIFJlc29sdmVycy5yZXNvbHZlTnVsbChwYXR0ZXJuKTtcbiAgfVxuXG4gIGlmKENoZWNrcy5pc19iaXRzdHJpbmcocGF0dGVybikpe1xuICAgIHJldHVybiBSZXNvbHZlcnMucmVzb2x2ZUJpdFN0cmluZyhwYXR0ZXJuKTtcbiAgfVxuXG4gIGlmKENoZWNrcy5pc19vYmplY3QocGF0dGVybikpe1xuICAgIHJldHVybiBSZXNvbHZlcnMucmVzb2x2ZU9iamVjdChwYXR0ZXJuKTtcbiAgfVxuXG4gIHJldHVybiBSZXNvbHZlcnMucmVzb2x2ZU5vTWF0Y2goKTtcbn1cbiIsIi8qIEBmbG93ICovXG5cbmltcG9ydCB7IGJ1aWxkTWF0Y2ggfSBmcm9tIFwiLi9tYXRjaFwiO1xuaW1wb3J0ICogYXMgVHlwZXMgZnJvbSBcIi4vdHlwZXNcIjtcblxuZXhwb3J0IGNsYXNzIE1hdGNoRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKGFyZykge1xuICAgIHN1cGVyKCk7XG5cbiAgICBpZih0eXBlb2YgYXJnID09PSAnc3ltYm9sJyl7XG4gICAgICB0aGlzLm1lc3NhZ2UgPSAnTm8gbWF0Y2ggZm9yOiAnICsgYXJnLnRvU3RyaW5nKCk7XG4gICAgfSBlbHNlIGlmKEFycmF5LmlzQXJyYXkoYXJnKSl7XG4gICAgICBsZXQgbWFwcGVkVmFsdWVzID0gYXJnLm1hcCgoeCkgPT4geC50b1N0cmluZygpKTtcbiAgICAgIHRoaXMubWVzc2FnZSA9ICdObyBtYXRjaCBmb3I6ICcgKyBtYXBwZWRWYWx1ZXM7XG4gICAgfWVsc2V7XG4gICAgICB0aGlzLm1lc3NhZ2UgPSAnTm8gbWF0Y2ggZm9yOiAnICsgYXJnO1xuICAgIH1cblxuICAgIHRoaXMuc3RhY2sgPSAobmV3IEVycm9yKCkpLnN0YWNrO1xuICAgIHRoaXMubmFtZSA9IHRoaXMuY29uc3RydWN0b3IubmFtZTtcbiAgfVxufVxuXG5cbmV4cG9ydCBjbGFzcyBDbGF1c2Uge1xuICBjb25zdHJ1Y3RvcihwYXR0ZXJuLCBmbiwgZ3VhcmQgPSAoKSA9PiB0cnVlKXtcbiAgICB0aGlzLnBhdHRlcm4gPSBidWlsZE1hdGNoKHBhdHRlcm4pO1xuICAgIHRoaXMuYXJpdHkgPSBwYXR0ZXJuLmxlbmd0aDtcbiAgICB0aGlzLm9wdGlvbmFscyA9IGdldE9wdGlvbmFsVmFsdWVzKHBhdHRlcm4pO1xuICAgIHRoaXMuZm4gPSBmbjtcbiAgICB0aGlzLmd1YXJkID0gZ3VhcmQ7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsYXVzZShwYXR0ZXJuLCBmbiwgZ3VhcmQgPSAoKSA9PiB0cnVlKSB7XG4gIHJldHVybiBuZXcgQ2xhdXNlKHBhdHRlcm4sIGZuLCBndWFyZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWZtYXRjaCguLi5jbGF1c2VzKSB7XG4gIHJldHVybiBmdW5jdGlvbiguLi5hcmdzKSB7XG4gICAgZm9yIChsZXQgcHJvY2Vzc2VkQ2xhdXNlIG9mIGNsYXVzZXMpIHtcbiAgICAgIGxldCByZXN1bHQgPSBbXTtcbiAgICAgIGFyZ3MgPSBmaWxsSW5PcHRpb25hbFZhbHVlcyhhcmdzLCBwcm9jZXNzZWRDbGF1c2UuYXJpdHksIHByb2Nlc3NlZENsYXVzZS5vcHRpb25hbHMpO1xuXG4gICAgICBpZiAocHJvY2Vzc2VkQ2xhdXNlLnBhdHRlcm4oYXJncywgcmVzdWx0KSAmJiBwcm9jZXNzZWRDbGF1c2UuZ3VhcmQuYXBwbHkodGhpcywgcmVzdWx0KSkge1xuICAgICAgICByZXR1cm4gcHJvY2Vzc2VkQ2xhdXNlLmZuLmFwcGx5KHRoaXMsIHJlc3VsdCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc29sZS5lcnJvcignTm8gbWF0Y2ggZm9yOicsIGFyZ3MpO1xuICAgIHRocm93IG5ldyBNYXRjaEVycm9yKGFyZ3MpO1xuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVmbWF0Y2hnZW4oLi4uY2xhdXNlcykge1xuICByZXR1cm4gZnVuY3Rpb24qKC4uLmFyZ3MpIHtcbiAgICBmb3IgKGxldCBwcm9jZXNzZWRDbGF1c2Ugb2YgY2xhdXNlcykge1xuICAgICAgbGV0IHJlc3VsdCA9IFtdO1xuICAgICAgYXJncyA9IGZpbGxJbk9wdGlvbmFsVmFsdWVzKGFyZ3MsIHByb2Nlc3NlZENsYXVzZS5hcml0eSwgcHJvY2Vzc2VkQ2xhdXNlLm9wdGlvbmFscyk7XG5cbiAgICAgIGlmIChwcm9jZXNzZWRDbGF1c2UucGF0dGVybihhcmdzLCByZXN1bHQpICYmIHByb2Nlc3NlZENsYXVzZS5ndWFyZC5hcHBseSh0aGlzLCByZXN1bHQpKSB7XG4gICAgICAgIHJldHVybiB5aWVsZCogcHJvY2Vzc2VkQ2xhdXNlLmZuLmFwcGx5KHRoaXMsIHJlc3VsdCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc29sZS5lcnJvcignTm8gbWF0Y2ggZm9yOicsIGFyZ3MpO1xuICAgIHRocm93IG5ldyBNYXRjaEVycm9yKGFyZ3MpO1xuICB9O1xufVxuXG5mdW5jdGlvbiBnZXRPcHRpb25hbFZhbHVlcyhwYXR0ZXJuKXtcbiAgbGV0IG9wdGlvbmFscyA9IFtdO1xuXG4gIGZvcihsZXQgaSA9IDA7IGkgPCBwYXR0ZXJuLmxlbmd0aDsgaSsrKXtcbiAgICBpZihwYXR0ZXJuW2ldIGluc3RhbmNlb2YgVHlwZXMuVmFyaWFibGUgJiYgcGF0dGVybltpXS5kZWZhdWx0X3ZhbHVlICE9IFN5bWJvbC5mb3IoXCJ0YWlsb3JlZC5ub192YWx1ZVwiKSl7XG4gICAgICBvcHRpb25hbHMucHVzaChbaSwgcGF0dGVybltpXS5kZWZhdWx0X3ZhbHVlXSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9wdGlvbmFscztcbn1cblxuZnVuY3Rpb24gZmlsbEluT3B0aW9uYWxWYWx1ZXMoYXJncywgYXJpdHksIG9wdGlvbmFscyl7XG4gIGlmKGFyZ3MubGVuZ3RoID09PSBhcml0eSB8fCBvcHRpb25hbHMubGVuZ3RoID09PSAwKXtcbiAgICByZXR1cm4gYXJncztcbiAgfVxuXG4gIGlmKGFyZ3MubGVuZ3RoICsgb3B0aW9uYWxzLmxlbmd0aCA8IGFyaXR5KXtcbiAgICByZXR1cm4gYXJncztcbiAgfVxuXG4gIGxldCBudW1iZXJPZk9wdGlvbmFsc1RvRmlsbCA9IGFyaXR5IC0gYXJncy5sZW5ndGg7XG4gIGxldCBvcHRpb25hbHNUb1JlbW92ZSA9IG9wdGlvbmFscy5sZW5ndGggLSBudW1iZXJPZk9wdGlvbmFsc1RvRmlsbDtcblxuICBsZXQgb3B0aW9uYWxzVG9Vc2UgPSBvcHRpb25hbHMuc2xpY2Uob3B0aW9uYWxzVG9SZW1vdmUpO1xuXG4gIGZvcihsZXQgW2luZGV4LCB2YWx1ZV0gb2Ygb3B0aW9uYWxzVG9Vc2Upe1xuICAgIGFyZ3Muc3BsaWNlKGluZGV4LCAwLCB2YWx1ZSk7XG4gICAgaWYoYXJncy5sZW5ndGggPT09IGFyaXR5KXtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBhcmdzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF0Y2gocGF0dGVybiwgZXhwciwgZ3VhcmQgPSAoKSA9PiB0cnVlKSB7XG4gIGxldCByZXN1bHQgPSBbXTtcbiAgbGV0IHByb2Nlc3NlZFBhdHRlcm4gPSBidWlsZE1hdGNoKHBhdHRlcm4pO1xuICBpZiAocHJvY2Vzc2VkUGF0dGVybihleHByLCByZXN1bHQpICYmIGd1YXJkLmFwcGx5KHRoaXMsIHJlc3VsdCkpe1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1lbHNle1xuICAgIGNvbnNvbGUuZXJyb3IoJ05vIG1hdGNoIGZvcjonLCBleHByKTtcbiAgICB0aHJvdyBuZXcgTWF0Y2hFcnJvcihleHByKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF0Y2hfb3JfZGVmYXVsdChwYXR0ZXJuLCBleHByLCBndWFyZCA9ICgpID0+IHRydWUsIGRlZmF1bHRfdmFsdWUgPSBudWxsKSB7XG4gIGxldCByZXN1bHQgPSBbXTtcbiAgbGV0IHByb2Nlc3NlZFBhdHRlcm4gPSBidWlsZE1hdGNoKHBhdHRlcm4pO1xuICBpZiAocHJvY2Vzc2VkUGF0dGVybihleHByLCByZXN1bHQpICYmIGd1YXJkLmFwcGx5KHRoaXMsIHJlc3VsdCkpe1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1lbHNle1xuICAgIHJldHVybiBkZWZhdWx0X3ZhbHVlO1xuICB9XG59XG4iLCJpbXBvcnQgeyBkZWZtYXRjaCwgbWF0Y2gsIE1hdGNoRXJyb3IsIENsYXVzZSwgY2xhdXNlLCBtYXRjaF9vcl9kZWZhdWx0LCBkZWZtYXRjaGdlbiB9IGZyb20gXCIuL3RhaWxvcmVkL2RlZm1hdGNoXCI7XG5pbXBvcnQgeyB2YXJpYWJsZSwgd2lsZGNhcmQsIHN0YXJ0c1dpdGgsIGNhcHR1cmUsIGhlYWRUYWlsLCB0eXBlLCBib3VuZCwgYml0U3RyaW5nTWF0Y2ggfSBmcm9tIFwiLi90YWlsb3JlZC90eXBlc1wiO1xuXG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgZGVmbWF0Y2gsIG1hdGNoLCBNYXRjaEVycm9yLFxuICB2YXJpYWJsZSwgd2lsZGNhcmQsIHN0YXJ0c1dpdGgsXG4gIGNhcHR1cmUsIGhlYWRUYWlsLCB0eXBlLCBib3VuZCxcbiAgQ2xhdXNlLCBjbGF1c2UsIGJpdFN0cmluZ01hdGNoLFxuICBtYXRjaF9vcl9kZWZhdWx0LCBkZWZtYXRjaGdlblxufTtcbiIsImltcG9ydCBDb3JlIGZyb20gJy4uL2NvcmUnO1xuXG4vL2h0dHBzOi8vZ2l0aHViLmNvbS9haXJwb3J0eWgvcHJvdG9tb3JwaGlzbVxuY2xhc3MgUHJvdG9jb2x7XG4gIGNvbnN0cnVjdG9yKHNwZWMpe1xuICAgIHRoaXMucmVnaXN0cnkgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5mYWxsYmFjayA9IG51bGw7XG5cbiAgICBmb3IgKGxldCBmdW5OYW1lIGluIHNwZWMpe1xuICAgICAgdGhpc1tmdW5OYW1lXSA9IGNyZWF0ZUZ1bihmdW5OYW1lKS5iaW5kKHRoaXMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZUZ1bihmdW5OYW1lKXtcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uKC4uLmFyZ3MpIHtcbiAgICAgICAgbGV0IHRoaW5nID0gYXJnc1swXTtcbiAgICAgICAgbGV0IGZ1biA9IG51bGw7XG5cbiAgICAgICAgaWYoTnVtYmVyLmlzSW50ZWdlcih0aGluZykgJiYgdGhpcy5oYXNJbXBsZW1lbnRhdGlvbihDb3JlLkludGVnZXIpKXtcbiAgICAgICAgICBmdW4gPSB0aGlzLnJlZ2lzdHJ5LmdldChDb3JlLkludGVnZXIpW2Z1bk5hbWVdO1xuICAgICAgICB9ZWxzZSBpZih0eXBlb2YgdGhpbmcgPT09IFwibnVtYmVyXCIgJiYgIU51bWJlci5pc0ludGVnZXIodGhpbmcpICYmIHRoaXMuaGFzSW1wbGVtZW50YXRpb24oQ29yZS5GbG9hdCkpe1xuICAgICAgICAgIGZ1biA9IHRoaXMucmVnaXN0cnkuZ2V0KENvcmUuRmxvYXQpW2Z1bk5hbWVdO1xuICAgICAgICB9ZWxzZSBpZih0eXBlb2YgdGhpbmcgPT09IFwic3RyaW5nXCIgJiYgdGhpcy5oYXNJbXBsZW1lbnRhdGlvbihDb3JlLkJpdFN0cmluZykpe1xuICAgICAgICAgIGZ1biA9IHRoaXMucmVnaXN0cnkuZ2V0KENvcmUuQml0U3RyaW5nKVtmdW5OYW1lXTtcbiAgICAgICAgfWVsc2UgaWYodGhpcy5oYXNJbXBsZW1lbnRhdGlvbih0aGluZykpe1xuICAgICAgICAgIGZ1biA9IHRoaXMucmVnaXN0cnkuZ2V0KHRoaW5nLmNvbnN0cnVjdG9yKVtmdW5OYW1lXTtcbiAgICAgICAgfWVsc2UgaWYodGhpcy5mYWxsYmFjayl7XG4gICAgICAgICAgZnVuID0gdGhpcy5mYWxsYmFja1tmdW5OYW1lXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGZ1biAhPSBudWxsKXtcbiAgICAgICAgICBsZXQgcmV0dmFsID0gZnVuLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgICAgICAgIHJldHVybiByZXR2YWw7XG4gICAgICAgIH1cblxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBpbXBsZW1lbnRhdGlvbiBmb3VuZCBmb3IgXCIgKyB0aGluZyk7XG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGltcGxlbWVudGF0aW9uKHR5cGUsIGltcGxlbWVudGF0aW9uKXtcbiAgICBpZih0eXBlID09PSBudWxsKXtcbiAgICAgIHRoaXMuZmFsbGJhY2sgPSBpbXBsZW1lbnRhdGlvbjtcbiAgICB9ZWxzZXtcbiAgICAgIHRoaXMucmVnaXN0cnkuc2V0KHR5cGUsIGltcGxlbWVudGF0aW9uKTtcbiAgICB9XG4gIH1cblxuICBoYXNJbXBsZW1lbnRhdGlvbih0aGluZykge1xuICAgIGlmICh0aGluZyA9PT0gQ29yZS5JbnRlZ2VyIHx8IHRoaW5nID09PSBDb3JlLkZsb2F0IHx8IENvcmUuQml0U3RyaW5nKXtcbiAgICAgIHJldHVybiB0aGlzLnJlZ2lzdHJ5Lmhhcyh0aGluZyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMucmVnaXN0cnkuaGFzKHRoaW5nLmNvbnN0cnVjdG9yKTtcbiAgfVxufVxuXG5cbmV4cG9ydCBkZWZhdWx0IFByb3RvY29sO1xuIiwiaW1wb3J0IFByb3RvY29sIGZyb20gJy4vcHJvdG9jb2wnO1xuaW1wb3J0IENvcmUgZnJvbSAnLi4vY29yZSc7XG5cbmZ1bmN0aW9uIGNhbGxfcHJvcGVydHkoaXRlbSwgcHJvcGVydHkpe1xuICBsZXQgcHJvcCA9IG51bGw7XG5cbiAgaWYodHlwZW9mIGl0ZW0gPT09IFwibnVtYmVyXCIgfHwgdHlwZW9mIGl0ZW0gPT09IFwic3ltYm9sXCIgfHwgdHlwZW9mIGl0ZW0gPT09IFwiYm9vbGVhblwiIHx8IHR5cGVvZiBpdGVtID09PSBcInN0cmluZ1wiKXtcbiAgICBpZihpdGVtW3Byb3BlcnR5XSAhPT0gdW5kZWZpbmVkKXtcbiAgICAgIHByb3AgPSBwcm9wZXJ0eTtcbiAgICB9ZWxzZSBpZihpdGVtW1N5bWJvbC5mb3IocHJvcGVydHkpXSAhPT0gdW5kZWZpbmVkKXtcbiAgICAgIHByb3AgPSBTeW1ib2wuZm9yKHByb3BlcnR5KTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYocHJvcGVydHkgaW4gaXRlbSl7XG4gICAgICBwcm9wID0gcHJvcGVydHk7XG4gICAgfWVsc2UgaWYoU3ltYm9sLmZvcihwcm9wZXJ0eSkgaW4gaXRlbSl7XG4gICAgICBwcm9wID0gU3ltYm9sLmZvcihwcm9wZXJ0eSk7XG4gICAgfVxuICB9XG5cbiAgaWYocHJvcCA9PT0gbnVsbCl7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBQcm9wZXJ0eSAkeyBwcm9wZXJ0eSB9IG5vdCBmb3VuZCBpbiAkeyBpdGVtIH1gKTtcbiAgfVxuXG4gIGlmKGl0ZW1bcHJvcF0gaW5zdGFuY2VvZiBGdW5jdGlvbil7XG4gICAgcmV0dXJuIGl0ZW1bcHJvcF0oKTtcbiAgfWVsc2V7XG4gICAgcmV0dXJuIGl0ZW1bcHJvcF07XG4gIH1cbn1cblxuZnVuY3Rpb24gYXBwbHkoLi4uYXJncyl7XG4gIGlmKGFyZ3MubGVuZ3RoID09PSAyKXtcbiAgICBhcmdzWzBdLmFwcGx5KG51bGwsIGFyZ3Muc2xpY2UoMSkpO1xuICB9ZWxzZXtcbiAgICBhcmdzWzBdW2FyZ3NbMV1dLmFwcGx5KG51bGwsIGFyZ3Muc2xpY2UoMikpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNvbnRhaW5zKGxlZnQsIHJpZ2h0KXtcbiAgZm9yKGxldCB4IG9mIHJpZ2h0KXtcbiAgICBpZihDb3JlLlBhdHRlcm5zLm1hdGNoX29yX2RlZmF1bHQobGVmdCwgeCkgIT0gbnVsbCl7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGdldF9nbG9iYWwoKXtcbiAgaWYodHlwZW9mKHNlbGYpICE9PSBcInVuZGVmaW5lZFwiKXtcbiAgICByZXR1cm4gc2VsZjtcbiAgfWVsc2UgaWYodHlwZW9mKHdpbmRvdykgIT09IFwidW5kZWZpbmVkXCIpe1xuICAgIHJldHVybiB3aW5kb3c7XG4gIH1lbHNlIGlmKHR5cGVvZihnbG9iYWwpICE9PSBcInVuZGVmaW5lZFwiKXtcbiAgICByZXR1cm4gZ2xvYmFsO1xuICB9XG5cbiAgdGhyb3cgbmV3IEVycm9yKFwiTm8gZ2xvYmFsIHN0YXRlIGZvdW5kXCIpO1xufVxuXG5mdW5jdGlvbiBkZWZzdHJ1Y3QoZGVmYXVsdHMpe1xuICByZXR1cm4gY2xhc3Mge1xuICAgIGNvbnN0cnVjdG9yKHVwZGF0ZSA9IHt9KXtcbiAgICAgIGxldCB0aGVfdmFsdWVzID0gT2JqZWN0LmFzc2lnbihkZWZhdWx0cywgdXBkYXRlKTtcbiAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgdGhlX3ZhbHVlcyk7XG4gICAgfVxuXG4gICAgc3RhdGljIGNyZWF0ZSh1cGRhdGVzID0ge30pe1xuICAgICAgbGV0IHggPSBuZXcgdGhpcyh1cGRhdGVzKTtcbiAgICAgIHJldHVybiBPYmplY3QuZnJlZXplKHgpO1xuICAgIH1cbiAgfTtcbn1cblxuXG5mdW5jdGlvbiBkZWZleGNlcHRpb24oZGVmYXVsdHMpe1xuICByZXR1cm4gY2xhc3MgZXh0ZW5kcyBFcnJvciB7XG4gICAgY29uc3RydWN0b3IodXBkYXRlID0ge30pe1xuICAgICAgbGV0IG1lc3NhZ2UgPSB1cGRhdGUubWVzc2FnZSB8fCBcIlwiO1xuICAgICAgc3VwZXIobWVzc2FnZSk7XG5cbiAgICAgIGxldCB0aGVfdmFsdWVzID0gT2JqZWN0LmFzc2lnbihkZWZhdWx0cywgdXBkYXRlKTtcbiAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgdGhlX3ZhbHVlcyk7XG5cbiAgICAgIHRoaXMubmFtZSA9IHRoaXMuY29uc3RydWN0b3IubmFtZTtcbiAgICAgIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gICAgICB0aGlzW1N5bWJvbC5mb3IoXCJfX2V4Y2VwdGlvbl9fXCIpXSA9IHRydWU7XG4gICAgICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSh0aGlzLCB0aGlzLmNvbnN0cnVjdG9yLm5hbWUpO1xuICAgIH1cblxuICAgIHN0YXRpYyBjcmVhdGUodXBkYXRlcyA9IHt9KXtcbiAgICAgIGxldCB4ID0gbmV3IHRoaXModXBkYXRlcyk7XG4gICAgICByZXR1cm4gT2JqZWN0LmZyZWV6ZSh4KTtcbiAgICB9XG4gIH07XG59XG5cbmZ1bmN0aW9uIGRlZnByb3RvY29sKHNwZWMpe1xuICByZXR1cm4gbmV3IFByb3RvY29sKHNwZWMpO1xufVxuXG5mdW5jdGlvbiBkZWZpbXBsKHByb3RvY29sLCB0eXBlLCBpbXBsKXtcbiAgcHJvdG9jb2wuaW1wbGVtZW50YXRpb24odHlwZSwgaW1wbCk7XG59XG5cbmZ1bmN0aW9uIGdldF9vYmplY3Rfa2V5cyhvYmope1xuICAgIHJldHVybiBPYmplY3Qua2V5cyhvYmopLmNvbmNhdChPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKG9iaikpO1xufVxuXG5mdW5jdGlvbiBpc192YWxpZF9jaGFyYWN0ZXIoY29kZXBvaW50KXtcbiAgdHJ5e1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNvZGVQb2ludChjb2RlcG9pbnQpICE9IG51bGw7XG4gIH1jYXRjaChlKXtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuLy9odHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvV2luZG93QmFzZTY0L0Jhc2U2NF9lbmNvZGluZ19hbmRfZGVjb2RpbmcjU29sdXRpb25fMl8lRTIlODAlOTNfcmV3cml0ZV90aGVfRE9Nc19hdG9iKClfYW5kX2J0b2EoKV91c2luZ19KYXZhU2NyaXB0J3NfVHlwZWRBcnJheXNfYW5kX1VURi04XG5mdW5jdGlvbiBiNjRFbmNvZGVVbmljb2RlKHN0cikge1xuICAgIHJldHVybiBidG9hKGVuY29kZVVSSUNvbXBvbmVudChzdHIpLnJlcGxhY2UoLyUoWzAtOUEtRl17Mn0pL2csIGZ1bmN0aW9uKG1hdGNoLCBwMSkge1xuICAgICAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZSgnMHgnICsgcDEpO1xuICAgIH0pKTtcbn1cblxuZnVuY3Rpb24gZGVsZXRlX3Byb3BlcnR5X2Zyb21fbWFwKG1hcCwgcHJvcGVydHkpe1xuICAgIGxldCBuZXdfbWFwID0gT2JqZWN0LmFzc2lnbihPYmplY3QuY3JlYXRlKG1hcC5jb25zdHJ1Y3Rvci5wcm90b3R5cGUpLCBtYXApO1xuICAgIGRlbGV0ZSBuZXdfbWFwW3Byb3BlcnR5XTtcblxuICByZXR1cm4gT2JqZWN0LmZyZWV6ZShuZXdfbWFwKTtcbn1cblxuZnVuY3Rpb24gY2xhc3NfdG9fb2JqKG1hcCl7XG4gICAgbGV0IG5ld19tYXAgPSBPYmplY3QuYXNzaWduKHt9LCBtYXApO1xuICByZXR1cm4gT2JqZWN0LmZyZWV6ZShuZXdfbWFwKTtcbn1cblxuZnVuY3Rpb24gYWRkX3Byb3BlcnR5X3RvX21hcChtYXAsIHByb3BlcnR5LCB2YWx1ZSl7XG4gIGxldCBuZXdfbWFwID0gT2JqZWN0LmFzc2lnbih7fSwgbWFwKTtcbiAgbmV3X21hcFtwcm9wZXJ0eV0gPSB2YWx1ZTtcbiAgcmV0dXJuIE9iamVjdC5mcmVlemUobmV3X21hcCk7XG59XG5cblxuZnVuY3Rpb24gdXBkYXRlX21hcChtYXAsIHByb3BlcnR5LCB2YWx1ZSl7XG4gICAgaWYocHJvcGVydHkgaW4gZ2V0X29iamVjdF9rZXlzKG1hcCkpe1xuICAgICAgICByZXR1cm4gYWRkX3Byb3BlcnR5X3RvX21hcChtYXAsIHByb3BlcnR5LCB2YWx1ZSk7XG4gICAgfVxuXG4gICAgdGhyb3cgXCJtYXAgZG9lcyBub3QgaGF2ZSBrZXlcIjtcbn1cblxuZnVuY3Rpb24gYm5vdChleHByKXtcbiAgcmV0dXJuIH5leHByO1xufVxuXG5mdW5jdGlvbiBiYW5kKGxlZnQsIHJpZ2h0KXtcbiAgcmV0dXJuIGxlZnQgJiByaWdodDtcbn1cblxuZnVuY3Rpb24gYm9yKGxlZnQsIHJpZ2h0KXtcbiAgcmV0dXJuIGxlZnQgfCByaWdodDtcbn1cblxuZnVuY3Rpb24gYnNsKGxlZnQsIHJpZ2h0KXtcbiAgcmV0dXJuIGxlZnQgPDwgcmlnaHQ7XG59XG5cbmZ1bmN0aW9uIGJzcihsZWZ0LCByaWdodCl7XG4gIHJldHVybiBsZWZ0ID4+IHJpZ2h0O1xufVxuXG5mdW5jdGlvbiBieG9yKGxlZnQsIHJpZ2h0KXtcbiAgcmV0dXJuIGxlZnQgXiByaWdodDtcbn1cblxuZnVuY3Rpb24gemlwKGxpc3Rfb2ZfbGlzdHMpe1xuICBpZihsaXN0X29mX2xpc3RzLmxlbmd0aCA9PT0gMCl7XG4gICAgcmV0dXJuIE9iamVjdC5mcmVlemUoW10pO1xuICB9XG5cbiAgbGV0IG5ld192YWx1ZSA9IFtdO1xuICBsZXQgc21hbGxlc3RfbGVuZ3RoID0gbGlzdF9vZl9saXN0c1swXTtcblxuICBmb3IobGV0IHggb2YgbGlzdF9vZl9saXN0cyl7XG4gICAgaWYoeC5sZW5ndGggPCBzbWFsbGVzdF9sZW5ndGgpe1xuICAgICAgc21hbGxlc3RfbGVuZ3RoID0geC5sZW5ndGg7XG4gICAgfVxuICB9XG5cbiAgZm9yKGxldCBpID0gMDsgaSA8IHNtYWxsZXN0X2xlbmd0aDsgaSsrKXtcbiAgICBsZXQgY3VycmVudF92YWx1ZSA9IFtdO1xuICAgIGZvcihsZXQgaiA9IDA7IGogPCBsaXN0X29mX2xpc3RzLmxlbmd0aDsgaisrKXtcbiAgICAgIGN1cnJlbnRfdmFsdWUucHVzaChsaXN0X29mX2xpc3RzW2pdW2ldKTtcbiAgICB9XG5cbiAgICBuZXdfdmFsdWUucHVzaChuZXcgQ29yZS5UdXBsZSguLi5jdXJyZW50X3ZhbHVlKSk7XG4gIH1cblxuICByZXR1cm4gT2JqZWN0LmZyZWV6ZShuZXdfdmFsdWUpO1xufVxuXG5mdW5jdGlvbiBjYW5fZGVjb2RlNjQoZGF0YSkge1xuICB0cnl7XG4gICAgYXRvYihkYXRhKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfWNhdGNoKGUpe1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZW1vdmVfZnJvbV9saXN0KGxpc3QsIGVsZW1lbnQpe1xuICAgIGxldCBmb3VuZCA9IGZhbHNlO1xuXG4gICAgcmV0dXJuIGxpc3QuZmlsdGVyKChlbGVtKSA9PiB7XG4gICAgICAgIGlmKCFmb3VuZCAmJiBlbGVtID09PSBlbGVtZW50KXtcbiAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBmb2xkbChmdW4sIGFjYywgbGlzdCl7XG4gICAgbGV0IGFjYzEgPSBhY2M7XG5cbiAgICBmb3IoY29uc3QgZWwgb2YgbGlzdCl7XG4gICAgICAgIGFjYzEgPSBmdW4oZWwsIGFjYzEpO1xuICAgIH1cblxuICAgIHJldHVybiBhY2MxO1xufVxuXG5cbmZ1bmN0aW9uIGZvbGRyKGZ1biwgYWNjLCBsaXN0KXtcbiAgICBsZXQgYWNjMSA9IGFjYztcblxuICAgIGZvcihsZXQgaSA9IGxpc3QubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pe1xuICAgICAgICBhY2MxID0gZnVuKGxpc3RbaV0sIGFjYzEpO1xuICAgIH1cblxuICAgIHJldHVybiBhY2MxO1xufVxuXG5mdW5jdGlvbiBrZXlmaW5kKGtleSwgbiwgdHVwbGVsaXN0KXtcblxuICBmb3IobGV0IGkgPSB0dXBsZWxpc3QubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pe1xuICAgIGlmKHR1cGxlbGlzdFtpXS5nZXQobikgPT09IGtleSl7XG4gICAgICByZXR1cm4gdHVwbGVsaXN0W2ldO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24ga2V5ZGVsZXRlKGtleSwgbiwgdHVwbGVsaXN0KXtcblxuICAgIGZvcihsZXQgaSA9IHR1cGxlbGlzdC5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgICAgIGlmKHR1cGxlbGlzdFtpXS5nZXQobikgPT09IGtleSl7XG4gICAgICAgICAgICByZXR1cm4gdHVwbGVsaXN0LmNvbmNhdChbXSkuc3BsaWNlKGksIDEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHR1cGxlbGlzdDtcbn1cblxuZnVuY3Rpb24ga2V5c3RvcmUoa2V5LCBuLCBsaXN0LCBuZXd0dXBsZSl7XG4gICAgZm9yKGxldCBpID0gbGlzdC5sZW5ndGggLSAxOyBpID49IDA7IGktLSl7XG4gICAgICAgIGlmKGxpc3RbaV0uZ2V0KG4pID09PSBrZXkpe1xuICAgICAgICAgICAgcmV0dXJuIGxpc3QuY29uY2F0KFtdKS5zcGxpY2UoaSwgMSwgbmV3dHVwbGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gIHJldHVybiBsaXN0LmNvbmNhdChbXSkucHVzaChuZXd0dXBsZSk7XG59XG5cbmZ1bmN0aW9uIGtleW1lbWJlcihrZXksIG4sIGxpc3Qpe1xuICBmb3IobGV0IGkgPSBsaXN0Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKXtcbiAgICBpZihsaXN0W2ldLmdldChuKSA9PT0ga2V5KXtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24ga2V5dGFrZShrZXksIG4sIGxpc3Qpe1xuICBpZigha2V5bWVtYmVyKGtleSwgbiwgbGlzdCkpe1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGxldCB0dXBsZSA9IGtleWZpbmQoa2V5LCBuLCBsaXN0KTtcblxuICByZXR1cm4gbmV3IFR1cGxlKHR1cGxlLmdldChuKSwgdHVwbGUsIGtleWRlbGV0ZShrZXksIG4sIGxpc3QpKTtcbn1cblxuZnVuY3Rpb24ga2V5cmVwbGFjZShrZXksIG4sIGxpc3QsIG5ld3R1cGxlKXtcblxuICBmb3IobGV0IGkgPSB0dXBsZWxpc3QubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pe1xuICAgIGlmKHR1cGxlbGlzdFtpXS5nZXQobikgPT09IGtleSl7XG4gICAgICByZXR1cm4gdHVwbGVsaXN0LmNvbmNhdChbXSkuc3BsaWNlKGksIDEsIG5ld3R1cGxlKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHVwbGVsaXN0O1xufVxuXG5cbmZ1bmN0aW9uIHJldmVyc2UobGlzdCl7XG4gICAgcmV0dXJuIGxpc3QuY29uY2F0KFtdKS5yZXZlcnNlKCk7XG59XG5cbmZ1bmN0aW9uIG1hcHNfZmluZChrZXksIG1hcCl7XG4gICAgaWYoa2V5IGluIGdldF9vYmplY3Rfa2V5cyhtYXApKXtcbiAgICAgICAgcmV0dXJuIG5ldyBDb3JlLlR1cGxlKFN5bWJvbC5mb3IoXCJva1wiKSwgbWFwW2tleV0pO1xuICAgIH1lbHNle1xuICAgICAgICByZXR1cm4gU3ltYm9sLmZvcihcImVycm9yXCIpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZmxhdHRlbihsaXN0LCB0YWlsID0gW10pIHtcbiAgbGV0IG5ld19saXN0ID0gW107XG5cbiAgZm9yKGxldCBlIG9mIGxpc3Qpe1xuICAgIGlmKEFycmF5LmlzQXJyYXkoZSkpe1xuICAgICAgbmV3X2xpc3QgPSBuZXdfbGlzdC5jb25jYXQoZmxhdHRlbihlKSk7XG4gICAgfWVsc2V7XG4gICAgICBuZXdfbGlzdC5wdXNoKGUpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBPYmplY3QuZnJlZXplKG5ld19saXN0LmNvbmNhdCh0YWlsKSk7XG59XG5cbmZ1bmN0aW9uIGR1cGxpY2F0ZShuLCBlbGVtKXtcbiAgbGV0IGxpc3QgPSBbXTtcblxuICBmb3IobGV0IGkgPSAwOyBpIDwgbjsgaSsrKXtcbiAgICBsaXN0LnB1c2goZWxlbSk7XG4gIH1cblxuICByZXR1cm4gT2JqZWN0LmZyZWV6ZShsaXN0KTtcbn1cblxuZnVuY3Rpb24gbWFwZm9sZGwoZnVuLCBhY2MsIGxpc3Qpe1xuICBsZXQgbmV3bGlzdCA9IFtdO1xuXG4gIGZvcihsZXQgeCBvZiBsaXN0KXtcbiAgICBsZXQgdHVwID0gZnVuKHgsIGFjYyk7XG4gICAgbmV3bGlzdC5wdXNoKHR1cC5nZXQoMCkpO1xuICAgIGFjYyA9IHR1cC5nZXQoMSk7XG4gIH1cblxuXG4gIHJldHVybiBuZXcgQ29yZS5UdXBsZShPYmplY3QuZnJlZXplKG5ld2xpc3QpLCBhY2MpO1xufVxuXG5mdW5jdGlvbiBmaWx0ZXJtYXAoZnVuLCBsaXN0KXtcbiAgbGV0IG5ld2xpc3QgPSBbXTtcblxuICBmb3IoeCBvZiBsaXN0KXtcbiAgICBsZXQgcmVzdWx0ID0gZnVuKHgpO1xuXG4gICAgaWYocmVzdWx0ID09PSB0cnVlKXtcbiAgICAgIG5ld2xpc3QucHVzaCh4KTtcbiAgICB9ZWxzZSBpZihyZXN1bHQgaW5zdGFuY2VvZiBDb3JlLlR1cGxlKXtcbiAgICAgIG5ld2xpc3QucHVzaChyZXN1bHQuZ2V0KDEpKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gT2JqZWN0LmZyZWV6ZShuZXdsaXN0KTtcbn1cblxuZnVuY3Rpb24gbWFwc19mb2xkKGZ1biwgYWNjLCBtYXApe1xuICBsZXQgYWNjMSA9IGFjYztcblxuICBmb3IobGV0IGsgb2YgZ2V0X29iamVjdF9rZXlzKG1hcCkpe1xuICAgIGFjYzEgPSBmdW4oaywgbWFwW2tdLCBhY2MxKTtcbiAgfVxuXG4gIHJldHVybiBhY2MxO1xufVxuXG5mdW5jdGlvbiBtYXBzX2Zyb21fbGlzdChsaXN0KXtcbiAgbGV0IG0gPSB7fTtcblxuICBmb3IoeCBvZiBsaXN0KXtcbiAgICBtW3guZ2V0KDApXSA9IHguZ2V0KDEpO1xuICB9XG5cbiAgcmV0dXJuIE9iamVjdC5mcmVlemUobSk7XG59XG5cbmZ1bmN0aW9uKiBzbGVlcF9mb3JldmVyKCl7XG4gIHlpZWxkKiBDb3JlLnByb2Nlc3Nlcy5zbGVlcChTeW1ib2woXCJpbmZpbml0eVwiKSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgY2FsbF9wcm9wZXJ0eSxcbiAgYXBwbHksXG4gIGNvbnRhaW5zLFxuICBnZXRfZ2xvYmFsLFxuICBkZWZzdHJ1Y3QsXG4gIGRlZmV4Y2VwdGlvbixcbiAgZGVmcHJvdG9jb2wsXG4gIGRlZmltcGwsXG4gIGdldF9vYmplY3Rfa2V5cyxcbiAgaXNfdmFsaWRfY2hhcmFjdGVyLFxuICBiNjRFbmNvZGVVbmljb2RlLFxuICBkZWxldGVfcHJvcGVydHlfZnJvbV9tYXAsXG4gIGFkZF9wcm9wZXJ0eV90b19tYXAsXG4gIGNsYXNzX3RvX29iaixcbiAgY2FuX2RlY29kZTY0LFxuICBibm90LFxuICBiYW5kLFxuICBib3IsXG4gIGJzbCxcbiAgYnNyLFxuICBieG9yLFxuICB6aXAsXG4gIGZvbGRsLFxuICBmb2xkcixcbiAgcmVtb3ZlX2Zyb21fbGlzdCxcbiAga2V5ZGVsZXRlLFxuICBrZXlzdG9yZSxcbiAga2V5ZmluZCxcbiAga2V5dGFrZSxcbiAga2V5cmVwbGFjZSxcbiAgcmV2ZXJzZSxcbiAgdXBkYXRlX21hcCxcbiAgbWFwc19maW5kLFxuICBmbGF0dGVuLFxuICBkdXBsaWNhdGUsXG4gIG1hcGZvbGRsLFxuICBmaWx0ZXJtYXAsXG4gIG1hcHNfZm9sZCxcbiAgc2xlZXBfZm9yZXZlclxufTtcbiIsImltcG9ydCBDb3JlIGZyb20gJy4uL2NvcmUnO1xuXG5mdW5jdGlvbiBfY2FzZShjb25kaXRpb24sIGNsYXVzZXMpe1xuICByZXR1cm4gQ29yZS5QYXR0ZXJucy5kZWZtYXRjaCguLi5jbGF1c2VzKShjb25kaXRpb24pO1xufVxuXG5mdW5jdGlvbiBjb25kKGNsYXVzZXMpe1xuICBmb3IobGV0IGNsYXVzZSBvZiBjbGF1c2VzKXtcbiAgICBpZihjbGF1c2VbMF0pe1xuICAgICAgcmV0dXJuIGNsYXVzZVsxXSgpO1xuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBFcnJvcigpO1xufVxuXG5mdW5jdGlvbiBtYXBfdXBkYXRlKG1hcCwgdmFsdWVzKXtcbiAgcmV0dXJuIE9iamVjdC5mcmVlemUoXG4gICAgT2JqZWN0LmFzc2lnbihcbiAgICAgIE9iamVjdC5jcmVhdGUobWFwLmNvbnN0cnVjdG9yLnByb3RvdHlwZSksIG1hcCwgdmFsdWVzXG4gICAgKVxuICApO1xufVxuXG5mdW5jdGlvbiBfZm9yKGNvbGxlY3Rpb25zLCBmdW4sIGZpbHRlciA9ICgpID0+IHRydWUsIGludG8gPSBbXSwgcHJldmlvdXNWYWx1ZXMgPSBbXSl7XG4gIGxldCBwYXR0ZXJuID0gY29sbGVjdGlvbnNbMF1bMF07XG4gIGxldCBjb2xsZWN0aW9uID0gY29sbGVjdGlvbnNbMF1bMV07XG5cbiAgaWYoY29sbGVjdGlvbnMubGVuZ3RoID09PSAxKXtcbiAgICBpZihjb2xsZWN0aW9uIGluc3RhbmNlb2YgQ29yZS5CaXRTdHJpbmcpe1xuICAgICAgbGV0IGJzU2xpY2UgPSBjb2xsZWN0aW9uLnNsaWNlKDAsIHBhdHRlcm4uYnl0ZV9zaXplKCkpO1xuICAgICAgbGV0IGkgPSAxO1xuXG4gICAgICB3aGlsZShic1NsaWNlLmJ5dGVfc2l6ZSA9PSBwYXR0ZXJuLmJ5dGVfc2l6ZSgpKXtcbiAgICAgICAgbGV0IHIgPSBDb3JlLlBhdHRlcm5zLm1hdGNoX29yX2RlZmF1bHQocGF0dGVybiwgYnNTbGljZSk7XG4gICAgICAgIGxldCBhcmdzID0gcHJldmlvdXNWYWx1ZXMuY29uY2F0KHIpO1xuXG4gICAgICAgIGlmKHIgJiYgZmlsdGVyLmFwcGx5KHRoaXMsIGFyZ3MpKXtcbiAgICAgICAgICBpbnRvID0gaW50by5jb25jYXQoW2Z1bi5hcHBseSh0aGlzLCBhcmdzKV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgYnNTbGljZSA9IGNvbGxlY3Rpb24uc2xpY2UocGF0dGVybi5ieXRlX3NpemUoKSAqIGksIHBhdHRlcm4uYnl0ZV9zaXplKCkgKiAoaSArIDEpKTtcbiAgICAgICAgaSsrO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gaW50bztcbiAgICB9ZWxzZXtcbiAgICAgIGZvcihsZXQgZWxlbSBvZiBjb2xsZWN0aW9uKXtcbiAgICAgICAgbGV0IHIgPSBDb3JlLlBhdHRlcm5zLm1hdGNoX29yX2RlZmF1bHQocGF0dGVybiwgZWxlbSk7XG4gICAgICAgIGxldCBhcmdzID0gcHJldmlvdXNWYWx1ZXMuY29uY2F0KHIpO1xuXG4gICAgICAgIGlmKHIgJiYgZmlsdGVyLmFwcGx5KHRoaXMsIGFyZ3MpKXtcbiAgICAgICAgICBpbnRvID0gaW50by5jb25jYXQoW2Z1bi5hcHBseSh0aGlzLCBhcmdzKV0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBpbnRvO1xuICAgIH1cbiAgfWVsc2V7XG4gICAgbGV0IF9pbnRvID0gW107XG5cbiAgICBpZihjb2xsZWN0aW9uIGluc3RhbmNlb2YgQ29yZS5CaXRTdHJpbmcpe1xuICAgICAgbGV0IGJzU2xpY2UgPSBjb2xsZWN0aW9uLnNsaWNlKDAsIHBhdHRlcm4uYnl0ZV9zaXplKCkpO1xuICAgICAgbGV0IGkgPSAxO1xuXG4gICAgICB3aGlsZShic1NsaWNlLmJ5dGVfc2l6ZSA9PSBwYXR0ZXJuLmJ5dGVfc2l6ZSgpKXtcbiAgICAgICAgbGV0IHIgPSBDb3JlLlBhdHRlcm5zLm1hdGNoX29yX2RlZmF1bHQocGF0dGVybiwgYnNTbGljZSk7XG4gICAgICAgIGlmKHIpe1xuICAgICAgICAgIF9pbnRvID0gaW50by5jb25jYXQodGhpcy5fZm9yKGNvbGxlY3Rpb25zLnNsaWNlKDEpLCBmdW4sIGZpbHRlciwgX2ludG8sIHByZXZpb3VzVmFsdWVzLmNvbmNhdChyKSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgYnNTbGljZSA9IGNvbGxlY3Rpb24uc2xpY2UocGF0dGVybi5ieXRlX3NpemUoKSAqIGksIHBhdHRlcm4uYnl0ZV9zaXplKCkgKiAoaSArIDEpKTtcbiAgICAgICAgaSsrO1xuICAgICAgfVxuICAgIH1lbHNle1xuICAgICAgZm9yKGxldCBlbGVtIG9mIGNvbGxlY3Rpb24pe1xuICAgICAgICBsZXQgciA9IENvcmUuUGF0dGVybnMubWF0Y2hfb3JfZGVmYXVsdChwYXR0ZXJuLCBlbGVtKTtcbiAgICAgICAgaWYocil7XG4gICAgICAgICAgX2ludG8gPSBpbnRvLmNvbmNhdCh0aGlzLl9mb3IoY29sbGVjdGlvbnMuc2xpY2UoMSksIGZ1biwgZmlsdGVyLCBfaW50bywgcHJldmlvdXNWYWx1ZXMuY29uY2F0KHIpKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gX2ludG87XG4gIH1cbn1cblxuZnVuY3Rpb24gX3RyeShkb19mdW4sIHJlc2N1ZV9mdW5jdGlvbiwgY2F0Y2hfZnVuLCBlbHNlX2Z1bmN0aW9uLCBhZnRlcl9mdW5jdGlvbil7XG4gIGxldCByZXN1bHQgPSBudWxsO1xuXG4gIHRyeXtcbiAgICByZXN1bHQgPSBkb19mdW4oKTtcbiAgfWNhdGNoKGUpe1xuICAgIGxldCBleF9yZXN1bHQgPSBudWxsO1xuXG4gICAgaWYocmVzY3VlX2Z1bmN0aW9uKXtcbiAgICAgIHRyeXtcbiAgICAgICAgZXhfcmVzdWx0ID0gcmVzY3VlX2Z1bmN0aW9uKGUpO1xuICAgICAgICByZXR1cm4gZXhfcmVzdWx0O1xuICAgICAgfWNhdGNoKGV4KXtcbiAgICAgICAgaWYoZXggaW5zdGFuY2VvZiBDb3JlLlBhdHRlcm5zLk1hdGNoRXJyb3Ipe1xuICAgICAgICAgIHRocm93IGV4O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYoY2F0Y2hfZnVuKXtcbiAgICAgIHRyeXtcbiAgICAgICAgZXhfcmVzdWx0ID0gY2F0Y2hfZnVuKGUpO1xuICAgICAgICByZXR1cm4gZXhfcmVzdWx0O1xuICAgICAgfWNhdGNoKGV4KXtcbiAgICAgICAgaWYoZXggaW5zdGFuY2VvZiBDb3JlLlBhdHRlcm5zLk1hdGNoRXJyb3Ipe1xuICAgICAgICAgIHRocm93IGV4O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgZTtcblxuICB9ZmluYWxseXtcbiAgICBpZihhZnRlcl9mdW5jdGlvbil7XG4gICAgICBhZnRlcl9mdW5jdGlvbigpO1xuICAgIH1cbiAgfVxuXG4gIGlmKGVsc2VfZnVuY3Rpb24pe1xuICAgIHRyeXtcbiAgICAgIHJldHVybiBlbHNlX2Z1bmN0aW9uKHJlc3VsdCk7XG4gICAgfWNhdGNoKGV4KXtcbiAgICAgICAgaWYoZXggaW5zdGFuY2VvZiBDb3JlLlBhdHRlcm5zLk1hdGNoRXJyb3Ipe1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vIE1hdGNoIEZvdW5kIGluIEVsc2VcIik7XG4gICAgICAgIH1cblxuICAgICAgdGhyb3cgZXg7XG4gICAgfVxuICB9ZWxzZXtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG59XG5cbmZ1bmN0aW9uIF93aXRoKC4uLmFyZ3Mpe1xuICBsZXQgYXJnc1RvUGFzcyA9IFtdO1xuICBsZXQgc3VjY2Vzc0Z1bmN0aW9uID0gbnVsbDtcbiAgbGV0IGVsc2VGdW5jdGlvbiA9IG51bGw7XG5cbiAgaWYodHlwZW9mKGFyZ3NbYXJncy5sZW5ndGggLSAyXSkgPT09ICdmdW5jdGlvbicpe1xuICAgIFtzdWNjZXNzRnVuY3Rpb24sIGVsc2VGdW5jdGlvbl0gPSBhcmdzLnNwbGljZSgtMik7XG4gIH1lbHNle1xuICAgIHN1Y2Nlc3NGdW5jdGlvbiA9IGFyZ3MucG9wKCk7XG4gIH1cblxuICBmb3IobGV0IGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7IGkrKyl7XG4gICAgbGV0IFtwYXR0ZXJuLCBmdW5jXSA9IGFyZ3NbaV07XG5cbiAgICBsZXQgcmVzdWx0ID0gZnVuYy5hcHBseShudWxsLCBhcmdzVG9QYXNzKTtcblxuICAgIGxldCBwYXR0ZXJuUmVzdWx0ID0gQ29yZS5QYXR0ZXJucy5tYXRjaF9vcl9kZWZhdWx0KHBhdHRlcm4sIHJlc3VsdCk7XG5cbiAgICBpZihwYXR0ZXJuUmVzdWx0ID09IG51bGwpe1xuICAgICAgaWYoZWxzZUZ1bmN0aW9uKXtcbiAgICAgICAgcmV0dXJuIGVsc2VGdW5jdGlvbi5jYWxsKG51bGwsIHJlc3VsdCk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cbiAgICB9ZWxzZXtcbiAgICAgIGFyZ3NUb1Bhc3MgPSBhcmdzVG9QYXNzLmNvbmNhdChwYXR0ZXJuUmVzdWx0KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gc3VjY2Vzc0Z1bmN0aW9uLmFwcGx5KG51bGwsIGFyZ3NUb1Bhc3MpO1xufVxuXG5leHBvcnQgZGVmYXVsdCB7XG4gIF9jYXNlLFxuICBjb25kLFxuICBtYXBfdXBkYXRlLFxuICBfZm9yLFxuICBfdHJ5LFxuICBfd2l0aFxufTtcbiIsImxldCBzdG9yZSA9IG5ldyBNYXAoKTtcbmxldCBuYW1lcyA9IG5ldyBNYXAoKTtcblxuZnVuY3Rpb24gZ2V0X2tleShrZXkpe1xuICBsZXQgcmVhbF9rZXkgPSBrZXk7XG5cbiAgaWYobmFtZXMuaGFzKGtleSkpe1xuICAgIHJlYWxfa2V5ID0gbmFtZXMuZ2V0KGtleSk7XG4gIH1cblxuICBpZihzdG9yZS5oYXMocmVhbF9rZXkpKXtcbiAgICByZXR1cm4gcmVhbF9rZXlcbiAgfVxuXG4gIHJldHVybiBuZXcgRXJyb3IoJ0tleSBOb3QgRm91bmQnKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlKGtleSwgdmFsdWUsIG5hbWUgPSBudWxsKXtcblxuICBpZihuYW1lICE9IG51bGwpe1xuICAgIG5hbWVzLnNldChuYW1lLCBrZXkpO1xuICB9XG5cbiAgc3RvcmUuc2V0KGtleSwgdmFsdWUpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGUoa2V5LCB2YWx1ZSl7XG4gIGxldCByZWFsX2tleSA9IGdldF9rZXkoa2V5KTtcbiAgc3RvcmUuc2V0KHJlYWxfa2V5LCB2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHJlYWQoa2V5KXtcbiAgbGV0IHJlYWxfa2V5ID0gZ2V0X2tleShrZXkpO1xuICByZXR1cm4gc3RvcmUuZ2V0KHJlYWxfa2V5KTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlKGtleSl7XG4gIGxldCByZWFsX2tleSA9IGdldF9rZXkoa2V5KTtcbiAgcmV0dXJuIHN0b3JlLmRlbGV0ZShyZWFsX2tleSk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgY3JlYXRlLFxuICByZWFkLFxuICB1cGRhdGUsXG4gIHJlbW92ZVxufTtcbiIsImltcG9ydCBQcm9jZXNzZXMgZnJvbSAnZXJsYW5nLXByb2Nlc3Nlcyc7XG5pbXBvcnQgUGF0dGVybnMgZnJvbSAndGFpbG9yZWQnO1xuaW1wb3J0IEVybGFuZ1R5cGVzIGZyb20gJ2VybGFuZy10eXBlcyc7XG5pbXBvcnQgRnVuY3Rpb25zIGZyb20gJy4vY29yZS9mdW5jdGlvbnMnO1xuaW1wb3J0IFNwZWNpYWxGb3JtcyBmcm9tICcuL2NvcmUvc3BlY2lhbF9mb3Jtcyc7XG5pbXBvcnQgU3RvcmUgZnJvbSAnLi9jb3JlL3N0b3JlJztcblxubGV0IHByb2Nlc3NlcyA9IG5ldyBQcm9jZXNzZXMuUHJvY2Vzc1N5c3RlbSgpO1xuXG5jbGFzcyBJbnRlZ2VyIHt9XG5jbGFzcyBGbG9hdCB7fVxuXG5leHBvcnQgZGVmYXVsdCB7XG4gIFByb2Nlc3NTeXN0ZW06IFByb2Nlc3Nlcy5Qcm9jZXNzU3lzdGVtLFxuICBwcm9jZXNzZXM6IHByb2Nlc3NlcyxcbiAgVHVwbGU6IEVybGFuZ1R5cGVzLlR1cGxlLFxuICBQSUQ6IEVybGFuZ1R5cGVzLlBJRCxcbiAgQml0U3RyaW5nOiBFcmxhbmdUeXBlcy5CaXRTdHJpbmcsXG4gIFBhdHRlcm5zLFxuICBJbnRlZ2VyLFxuICBGbG9hdCxcbiAgRnVuY3Rpb25zLFxuICBTcGVjaWFsRm9ybXMsXG4gIFN0b3JlXG59O1xuIiwiaW1wb3J0IENvcmUgZnJvbSAnLi9jb3JlJztcblxubGV0IEVudW0gPSB7XG5cbiAgYWxsX19xbWFya19fOiBmdW5jdGlvbihjb2xsZWN0aW9uLCBmdW4gPSAoeCkgPT4geCl7XG4gICAgZm9yKGxldCBlbGVtIG9mIGNvbGxlY3Rpb24pe1xuICAgICAgaWYoIWZ1bihlbGVtKSl7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSxcblxuICBhbnlfX3FtYXJrX186IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIGZ1biA9ICh4KSA9PiB4KXtcbiAgICBmb3IobGV0IGVsZW0gb2YgY29sbGVjdGlvbil7XG4gICAgICBpZihmdW4oZWxlbSkpe1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH0sXG5cbiAgYXQ6IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIG4sIHRoZV9kZWZhdWx0ID0gbnVsbCl7XG4gICAgaWYobiA+IHRoaXMuY291bnQoY29sbGVjdGlvbikgfHwgbiA8IDApe1xuICAgICAgcmV0dXJuIHRoZV9kZWZhdWx0O1xuICAgIH1cblxuICAgIHJldHVybiBjb2xsZWN0aW9uW25dO1xuICB9LFxuXG4gIGNvbmNhdDogZnVuY3Rpb24oLi4uZW51bWFibGVzKXtcbiAgICByZXR1cm4gZW51bWFibGVzWzBdLmNvbmNhdChlbnVtYWJsZXNbMV0pO1xuICB9LFxuXG4gIGNvdW50OiBmdW5jdGlvbihjb2xsZWN0aW9uLCBmdW4gPSBudWxsKXtcbiAgICBpZihmdW4gPT0gbnVsbCl7XG4gICAgICByZXR1cm4gY29sbGVjdGlvbi5sZW5ndGg7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjb2xsZWN0aW9uLmZpbHRlcihmdW4pLmxlbmd0aDtcbiAgICB9XG4gIH0sXG5cbiAgZHJvcDogZnVuY3Rpb24oY29sbGVjdGlvbiwgY291bnQpe1xuICAgIHJldHVybiBjb2xsZWN0aW9uLnNsaWNlKGNvdW50KTtcbiAgfSxcblxuICBkcm9wX3doaWxlOiBmdW5jdGlvbihjb2xsZWN0aW9uLCBmdW4pe1xuICAgIGxldCBjb3VudCA9IDA7XG5cbiAgICBmb3IobGV0IGVsZW0gb2YgY29sbGVjdGlvbil7XG4gICAgICBpZihmdW4oZWxlbSkpe1xuICAgICAgICBjb3VudCA9IGNvdW50ICsgMTtcbiAgICAgIH1lbHNle1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gY29sbGVjdGlvbi5zbGljZShjb3VudCk7XG4gIH0sXG5cbiAgZWFjaDogZnVuY3Rpb24oY29sbGVjdGlvbiwgZnVuKXtcbiAgICBmb3IobGV0IGVsZW0gb2YgY29sbGVjdGlvbil7XG4gICAgICBmdW4oZWxlbSk7XG4gICAgfVxuICB9LFxuXG4gIGVtcHR5X19xbWFya19fOiBmdW5jdGlvbihjb2xsZWN0aW9uKXtcbiAgICByZXR1cm4gY29sbGVjdGlvbi5sZW5ndGggPT09IDA7XG4gIH0sXG5cbiAgZmV0Y2g6IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIG4pe1xuICAgIGlmKEFycmF5LmlzQXJyYXkoY29sbGVjdGlvbikpe1xuICAgICAgaWYobiA8IHRoaXMuY291bnQoY29sbGVjdGlvbikgJiYgbiA+PSAwKXtcbiAgICAgICAgcmV0dXJuIG5ldyBDb3JlLlR1cGxlKFN5bWJvbC5mb3IoXCJva1wiKSwgY29sbGVjdGlvbltuXSk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgcmV0dXJuIFN5bWJvbC5mb3IoXCJlcnJvclwiKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJjb2xsZWN0aW9uIGlzIG5vdCBhbiBFbnVtZXJhYmxlXCIpO1xuICB9LFxuXG4gIGZldGNoX19lbWFya19fOiBmdW5jdGlvbihjb2xsZWN0aW9uLCBuKXtcbiAgICBpZihBcnJheS5pc0FycmF5KGNvbGxlY3Rpb24pKXtcbiAgICAgIGlmKG4gPCB0aGlzLmNvdW50KGNvbGxlY3Rpb24pICYmIG4gPj0gMCl7XG4gICAgICAgIHJldHVybiBjb2xsZWN0aW9uW25dO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIm91dCBvZiBib3VuZHMgZXJyb3JcIik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiY29sbGVjdGlvbiBpcyBub3QgYW4gRW51bWVyYWJsZVwiKTtcbiAgfSxcblxuICBmaWx0ZXI6IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIGZ1bil7XG4gICAgbGV0IHJlc3VsdCA9IFtdO1xuXG4gICAgZm9yKGxldCBlbGVtIG9mIGNvbGxlY3Rpb24pe1xuICAgICAgaWYoZnVuKGVsZW0pKXtcbiAgICAgICAgcmVzdWx0LnB1c2goZWxlbSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSxcblxuICBmaWx0ZXJfbWFwOiBmdW5jdGlvbihjb2xsZWN0aW9uLCBmaWx0ZXIsIG1hcHBlcil7XG4gICAgcmV0dXJuIEVudW0ubWFwKEVudW0uZmlsdGVyKGNvbGxlY3Rpb24sIGZpbHRlciksIG1hcHBlcik7XG4gIH0sXG5cbiAgZmluZDogZnVuY3Rpb24oY29sbGVjdGlvbiwgaWZfbm9uZSA9IG51bGwsIGZ1bil7XG4gICAgZm9yKGxldCBlbGVtIG9mIGNvbGxlY3Rpb24pe1xuICAgICAgaWYoZnVuKGVsZW0pKXtcbiAgICAgICAgcmV0dXJuIGVsZW07XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGlmX25vbmU7XG4gIH0sXG5cbiAgaW50bzogZnVuY3Rpb24oY29sbGVjdGlvbiwgbGlzdCl7XG4gICAgcmV0dXJuIGxpc3QuY29uY2F0KGNvbGxlY3Rpb24pO1xuICB9LFxuXG4gIG1hcDogZnVuY3Rpb24oY29sbGVjdGlvbiwgZnVuKXtcbiAgICBsZXQgcmVzdWx0ID0gW107XG5cbiAgICBmb3IobGV0IGVsZW0gb2YgY29sbGVjdGlvbil7XG4gICAgICByZXN1bHQucHVzaChmdW4oZWxlbSkpO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH0sXG5cbiAgbWFwX3JlZHVjZTogZnVuY3Rpb24oY29sbGVjdGlvbiwgYWNjLCBmdW4pe1xuICAgIGxldCBtYXBwZWQgPSBPYmplY3QuZnJlZXplKFtdKTtcbiAgICBsZXQgdGhlX2FjYyA9IGFjYztcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jb3VudChjb2xsZWN0aW9uKTsgaSsrKSB7XG4gICAgICBsZXQgdHVwbGUgPSBmdW4oY29sbGVjdGlvbltpXSwgdGhlX2FjYyk7XG5cbiAgICAgIHRoZV9hY2MgPSB0dXBsZS5nZXQoMSk7XG4gICAgICBtYXBwZWQgPSBPYmplY3QuZnJlZXplKG1hcHBlZC5jb25jYXQoW3R1cGxlLmdldCgwKV0pKTtcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IENvcmUuVHVwbGUobWFwcGVkLCB0aGVfYWNjKTtcbiAgfSxcblxuICBtZW1iZXJfX3FtYXJrX186IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIHZhbHVlKXtcbiAgICByZXR1cm4gY29sbGVjdGlvbi5pbmNsdWRlcyh2YWx1ZSk7XG4gIH0sXG5cbiAgcmVkdWNlOiBmdW5jdGlvbihjb2xsZWN0aW9uLCBhY2MsIGZ1bil7XG4gICAgbGV0IHRoZV9hY2MgPSBhY2M7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY291bnQoY29sbGVjdGlvbik7IGkrKykge1xuICAgICAgbGV0IHR1cGxlID0gZnVuKGNvbGxlY3Rpb25baV0sIHRoZV9hY2MpO1xuXG4gICAgICB0aGVfYWNjID0gdHVwbGUuZ2V0KDEpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGVfYWNjO1xuICB9LFxuXG4gIHRha2U6IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIGNvdW50KXtcbiAgICByZXR1cm4gY29sbGVjdGlvbi5zbGljZSgwLCBjb3VudCk7XG4gIH0sXG5cbiAgdGFrZV9ldmVyeTogZnVuY3Rpb24oY29sbGVjdGlvbiwgbnRoKXtcbiAgICBsZXQgcmVzdWx0ID0gW107XG4gICAgbGV0IGluZGV4ID0gMDtcblxuICAgIGZvcihsZXQgZWxlbSBvZiBjb2xsZWN0aW9uKXtcbiAgICAgIGlmKGluZGV4ICUgbnRoID09PSAwKXtcbiAgICAgICAgcmVzdWx0LnB1c2goZWxlbSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIE9iamVjdC5mcmVlemUocmVzdWx0KTtcbiAgfSxcblxuICB0YWtlX3doaWxlOiBmdW5jdGlvbihjb2xsZWN0aW9uLCBmdW4pe1xuICAgIGxldCBjb3VudCA9IDA7XG5cbiAgICBmb3IobGV0IGVsZW0gb2YgY29sbGVjdGlvbil7XG4gICAgICBpZihmdW4oZWxlbSkpe1xuICAgICAgICBjb3VudCA9IGNvdW50ICsgMTtcbiAgICAgIH1lbHNle1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gY29sbGVjdGlvbi5zbGljZSgwLCBjb3VudCk7XG4gIH0sXG5cbiAgdG9fbGlzdDogZnVuY3Rpb24oY29sbGVjdGlvbil7XG4gICAgcmV0dXJuIGNvbGxlY3Rpb247XG4gIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IEVudW07XG4iLCJpbXBvcnQgQ29yZSBmcm9tICcuL2xpYi9jb3JlJztcbmltcG9ydCBFbnVtIGZyb20gJy4vbGliL2VudW0nO1xuXG5leHBvcnQgZGVmYXVsdCB7XG4gIENvcmUsXG4gIEVudW1cbn07XG4iXSwibmFtZXMiOlsiVHVwbGUiLCJCaXRTdHJpbmciLCJDaGVja3MuaXNfc3ltYm9sIiwiQ2hlY2tzLmlzX3N0cmluZyIsIkNoZWNrcy5pc19udW1iZXIiLCJDaGVja3MuaXNfYm9vbGVhbiIsIkNoZWNrcy5pc19udWxsIiwiQ2hlY2tzLmlzX2FycmF5IiwiQ2hlY2tzLmlzX29iamVjdCIsIkNoZWNrcy5pc192YXJpYWJsZSIsIlJlc29sdmVycy5yZXNvbHZlVmFyaWFibGUiLCJDaGVja3MuaXNfd2lsZGNhcmQiLCJSZXNvbHZlcnMucmVzb2x2ZVdpbGRjYXJkIiwiQ2hlY2tzLmlzX3VuZGVmaW5lZCIsIkNoZWNrcy5pc19oZWFkVGFpbCIsIlJlc29sdmVycy5yZXNvbHZlSGVhZFRhaWwiLCJDaGVja3MuaXNfc3RhcnRzV2l0aCIsIlJlc29sdmVycy5yZXNvbHZlU3RhcnRzV2l0aCIsIkNoZWNrcy5pc19jYXB0dXJlIiwiUmVzb2x2ZXJzLnJlc29sdmVDYXB0dXJlIiwiQ2hlY2tzLmlzX2JvdW5kIiwiUmVzb2x2ZXJzLnJlc29sdmVCb3VuZCIsIkNoZWNrcy5pc190eXBlIiwiUmVzb2x2ZXJzLnJlc29sdmVUeXBlIiwiUmVzb2x2ZXJzLnJlc29sdmVBcnJheSIsIlJlc29sdmVycy5yZXNvbHZlTnVtYmVyIiwiUmVzb2x2ZXJzLnJlc29sdmVTdHJpbmciLCJSZXNvbHZlcnMucmVzb2x2ZUJvb2xlYW4iLCJSZXNvbHZlcnMucmVzb2x2ZVN5bWJvbCIsIlJlc29sdmVycy5yZXNvbHZlTnVsbCIsIkNoZWNrcy5pc19iaXRzdHJpbmciLCJSZXNvbHZlcnMucmVzb2x2ZUJpdFN0cmluZyIsIlJlc29sdmVycy5yZXNvbHZlT2JqZWN0IiwiUmVzb2x2ZXJzLnJlc29sdmVOb01hdGNoIiwiVHlwZXMuVmFyaWFi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
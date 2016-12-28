    import Elixir from '../elixir/Elixir.Bootstrap';
    import Elixir$ElixirScript$Kernel from '../elixir/Elixir.ElixirScript.Kernel';
    import Elixir$JS from '../elixir/Elixir.JS';
    import Elixir$ElixirScript$Keyword from '../elixir/Elixir.ElixirScript.Keyword';
    const update = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(agent,fun)    {
        let [current_state] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),Elixir.Core.Store.read(agent));
        Elixir.Core.Store.update(agent,fun(current_state));
        return     Symbol.for('ok');
      }));
    const get_and_update = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(agent,fun)    {
        let [current_state] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),Elixir.Core.Store.read(agent));
        let [val,new_state] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.type(Elixir.Core.Tuple,{
        values: [Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()]
  }),fun(current_state));
        let _ref = new Elixir.Core.Tuple(val,new_state);
        Elixir.Core.Store.update(agent,new_state);
        return     val;
      }));
    const start = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(Object.freeze([]))],function(fun,options)    {
        let [pid] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),new Elixir.Core.PID());
        let [name] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(x)    {
        return     null;
      },function(x)    {
        return     (x === null) || (x === false);
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.wildcard()],function()    {
        return     Elixir$ElixirScript$Keyword.get(options,Symbol.for('name'));
      })).call(this,Elixir$ElixirScript$Keyword.has_key__qmark__(options,Symbol.for('name'))));
        Elixir.Core.Store.create(pid,fun(),name);
        return     new Elixir.Core.Tuple(Symbol.for('ok'),pid);
      }));
    const get = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(agent,fun)    {
        let [current_state] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),Elixir.Core.Store.read(agent));
        return     fun(current_state);
      }));
    const start_link = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(Object.freeze([]))],function(fun,options)    {
        let [pid] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),new Elixir.Core.PID());
        let [name] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(x)    {
        return     null;
      },function(x)    {
        return     (x === null) || (x === false);
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.wildcard()],function()    {
        return     Elixir$ElixirScript$Keyword.get(options,Symbol.for('name'));
      })).call(this,Elixir$ElixirScript$Keyword.has_key__qmark__(options,Symbol.for('name'))));
        Elixir.Core.Store.create(pid,fun(),name);
        return     new Elixir.Core.Tuple(Symbol.for('ok'),pid);
      }));
    const stop = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(agent)    {
        Elixir.Core.Store.remove(agent);
        return     Symbol.for('ok');
      }));
    export default {
        update,     get_and_update,     start,     get,     start_link,     stop
  };
    import Elixir from '../elixir/Elixir.Bootstrap';
    import Elixir$ElixirScript$Kernel from '../elixir/Elixir.ElixirScript.Kernel';
    const alive__qmark__ = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(pid)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').is_alive(pid);
      }));
    const flag = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(flag,value)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').process_flag(flag,value);
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(pid,flag,value)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').process_flag(pid,flag,value);
      }));
    const __delete__ = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(key)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').erase(key);
      }));
    const exit = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(pid,reason)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').exit(pid,reason);
      }));
    const list = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([],function()    {
        return     Elixir.Core.Functions.call_property(Elixir.Core.Functions.call_property(Elixir.Core,'processes'),'list');
      }));
    const registered = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([],function()    {
        return     Elixir.Core.Functions.call_property(Elixir.Core.Functions.call_property(Elixir.Core,'processes'),'registered');
      }));
    const get = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([],function()    {
        return     Elixir.Core.Functions.call_property(Elixir.Core.Functions.call_property(Elixir.Core,'processes'),'get_process_dict');
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(null)],function(key,__default__)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').get(key,__default__);
      }));
    const put = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(key,value)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').put(key,value);
      }));
    const send = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.wildcard()],function(dest,msg)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').send(dest,msg);
      }));
    const get_keys = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([],function()    {
        return     Elixir.Core.Functions.call_property(Elixir.Core.Functions.call_property(Elixir.Core,'processes'),'get_keys');
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(value)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').get_keys(value);
      }));
    const whereis = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(name)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').whereis(name);
      }));
    const link = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(pid)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').link(pid);
      }));
    const unlink = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(pid)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').unlink(pid);
      }));
    const monitor = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(item)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').monitor(item);
      }));
    const demonitor = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(monitor_ref)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').demonitor(monitor_ref);
      }));
    const register = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(pid,name)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').register(name,pid);
      },function(pid,name)    {
        return     Elixir$ElixirScript$Kernel.is_atom(name);
      }));
    const unregister = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(name)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').unregister(name);
      }));
    const sleep = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(duration)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').sleep(duration);
      },function(duration)    {
        return     Elixir$ElixirScript$Kernel.is_integer(duration);
      }),Elixir.Core.Patterns.clause([Symbol.for('infinity')],function()    {
        return     Elixir.Core.Functions.call_property(Elixir.Core,'processes').sleep(Symbol.for('infinity'));
      }));
    export default {
        alive__qmark__,     flag,     __delete__,     exit,     list,     registered,     get,     put,     send,     get_keys,     whereis,     link,     unlink,     monitor,     demonitor,     register,     unregister,     sleep
  };
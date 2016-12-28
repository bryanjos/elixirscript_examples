    import Elixir from '../elixir/Elixir.Bootstrap';
    import Elixir$ElixirScript$Kernel from '../elixir/Elixir.ElixirScript.Kernel';
    import Elixir$JS from '../elixir/Elixir.JS';
    const do_duplicate = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.wildcard(), 0, Elixir.Core.Patterns.variable()],function(list)    {
        return     list;
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(data,size,list)    {
        return     do_duplicate(data,size - 1,list.concat(Object.freeze([data])));
      }));
    const do_insert_at = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(tuple,index,value,current_index,list)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(x)    {
        let [list] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([true],function()    {
        return     list.concat(Object.freeze([value, tuple.get(current_index)]));
      }),Elixir.Core.Patterns.clause([false],function()    {
        return     list.concat(Object.freeze([tuple.get(current_index)]));
      })).call(this,index == current_index));
        return     do_insert_at(tuple,index,value,current_index + 1,list);
      },function(x)    {
        return     (x === null) || (x === false);
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.wildcard()],function()    {
        return     list;
      })).call(this,current_index == Elixir$ElixirScript$Kernel.length(tuple));
      }));
    const do_delete_at = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(tuple,index,current_index,list)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(x)    {
        let [list] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([true],function()    {
        return     list;
      }),Elixir.Core.Patterns.clause([false],function()    {
        return     list.concat(Object.freeze([tuple.get(current_index)]));
      })).call(this,index == current_index));
        return     do_delete_at(tuple,index,current_index + 1,list);
      },function(x)    {
        return     (x === null) || (x === false);
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.wildcard()],function()    {
        return     list;
      })).call(this,current_index == Elixir$ElixirScript$Kernel.length(tuple));
      }));
    const duplicate = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(data,size)    {
        return     new Elixir.Core.Tuple(...do_duplicate(data,size,Object.freeze([])));
      }));
    const to_list = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(tuple)    {
        return     tuple['value'];
      }));
    const insert_at = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(tuple,index,value)    {
        return     new Elixir.Core.Tuple(...do_insert_at(tuple,index,value,0,Object.freeze([])));
      }));
    const delete_at = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(tuple,index)    {
        return     new Elixir.Core.Tuple(...do_delete_at(tuple,index,0,Object.freeze([])));
      }));
    const append = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(tuple,value)    {
        return     new Elixir.Core.Tuple(...to_list.concat(Object.freeze([value])));
      }));
    export default {
        duplicate,     to_list,     insert_at,     delete_at,     append
  };
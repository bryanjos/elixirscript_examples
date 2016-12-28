    import Elixir from '../elixir/Elixir.Bootstrap';
    import Elixir$ElixirScript$Kernel from '../elixir/Elixir.ElixirScript.Kernel';
    import Elixir$ElixirScript$String$Chars from '../elixir/Elixir.ElixirScript.String.Chars';
    const do_split = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.wildcard(), Object.freeze([]), Elixir.Core.Patterns.variable()],function(split_tuple)    {
        return     split_tuple;
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.type(Elixir.Core.Tuple,{
        values: [Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()]
  })],function(map,keys,key_map,non_key_map)    {
        let [key] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),Elixir$ElixirScript$Kernel.hd(keys));
        let [new_split_tuple] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([true],function()    {
        return     new Elixir.Core.Tuple(Elixir$ElixirScript$Map.put(key_map,key,map[key]),non_key_map);
      }),Elixir.Core.Patterns.clause([false],function()    {
        return     new Elixir.Core.Tuple(key_map,Elixir$ElixirScript$Map.put(non_key_map,key,map[key]));
      })).call(this,Elixir.Enum.member__qmark__(keys(map),key)));
        return     do_split(map,Elixir$ElixirScript$Kernel.tl(keys),new_split_tuple);
      }));
    const __new__ = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([],function()    {
        return     Object.freeze({});
      }));
    const equal__qmark__ = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map1,map2)    {
        return     map1 === map2;
      }));
    const put_new = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key,value)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([true],function()    {
        return     map;
      }),Elixir.Core.Patterns.clause([false],function()    {
        return     Elixir$ElixirScript$Map.put(map,key,value);
      })).call(this,Elixir.Enum.member__qmark__(keys(map),key));
      }));
    const has_key__qmark__ = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key)    {
        return     Elixir.Enum.member__qmark__(keys(map),key);
      }));
    const size = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(map)    {
        return     Elixir.Core.Functions.call_property(keys,'length');
      }));
    const get_and_update = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key,func)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([true],function()    {
        return     new Elixir.Core.Tuple(null,map);
      }),Elixir.Core.Patterns.clause([false],function()    {
        let [new_value] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),func(map[key]));
        return     new Elixir.Core.Tuple(new_value,Elixir$ElixirScript$Map.put(map,key,new_value));
      })).call(this,Elixir.Enum.member__qmark__(keys(map),key));
      }));
    const __delete__ = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key)    {
        return     Elixir.Core.Functions.delete_property_from_map(map,key);
      }));
    const update = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key,initial,func)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([true],function()    {
        return     Elixir$ElixirScript$Map.put(map,key,func(map[key]));
      }),Elixir.Core.Patterns.clause([false],function()    {
        return     Elixir$ElixirScript$Map.put(map,key,initial);
      })).call(this,Elixir.Enum.member__qmark__(keys(map),key));
      }));
    const merge = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map1,map2)    {
        return     Elixir.Core.SpecialForms.map_update(map1,map2);
      }));
    const take = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,keys)    {
        let [key_map,undefined] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.type(Elixir.Core.Tuple,{
        values: [Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.wildcard()]
  }),split(map,keys));
        let _ref = new Elixir.Core.Tuple(key_map,undefined);
        return     key_map;
      }));
    const to_list = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(map)    {
        return     do_to_list(map,Object.freeze([]));
      }));
    const from_struct = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(struct)    {
        return     __delete__(Elixir.Core.Functions.class_to_obj(struct),Symbol.for('__struct__'));
      }));
    const do_to_list = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,list)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([0],function()    {
        return     list;
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.wildcard()],function()    {
        let [key] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),Elixir$ElixirScript$Kernel.hd(keys(map)));
        let [value] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),map[key]);
        return     do_to_list(Elixir$ElixirScript$Map.__delete__(map,key),list.concat(Object.freeze([new Elixir.Core.Tuple(key,value)])));
      })).call(this,size(map));
      }));
    const put = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key,value)    {
        return     Elixir.Core.Functions.add_property_to_map(map,key,value);
      }));
    const get = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key)    {
        return     get(map,key,null);
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key,default_value)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([true],function()    {
        return     map[key];
      }),Elixir.Core.Patterns.clause([false],function()    {
        return     default_value;
      })).call(this,Elixir.Enum.member__qmark__(keys(map),key));
      }));
    const split = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,keys)    {
        return     do_split(map,keys,new Elixir.Core.Tuple(Object.freeze({}),Object.freeze({})));
      }));
    const keys = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(map)    {
        return     Elixir.Core.Functions.get_object_keys(map);
      }));
    const values = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(map)    {
        return     Object.values(map);
      }));
    const fetch__emark__ = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([true],function()    {
        return     map[key];
      }),Elixir.Core.Patterns.clause([false],function()    {
        throw     {
                [Symbol.for('__struct__')]: Symbol.for('RuntimeError'),         [Symbol.for('__exception__')]: true,         [Symbol.for('message')]: Elixir$ElixirScript$String$Chars.to_string(key) + ' not found in map'
      };
        return     null;
      })).call(this,Elixir.Enum.member__qmark__(keys(map),key));
      }));
    const pop_lazy = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key,func)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([true],function()    {
        return     new Elixir.Core.Tuple(func(map[key]),Elixir$ElixirScript$Map.__delete__(map,key));
      }),Elixir.Core.Patterns.clause([false],function()    {
        return     new Elixir.Core.Tuple(func(),map);
      })).call(this,Elixir.Enum.member__qmark__(keys(map),key));
      }));
    const put_new_lazy = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key,func)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([true],function()    {
        return     map;
      }),Elixir.Core.Patterns.clause([false],function()    {
        return     Elixir$ElixirScript$Map.put(map,key,func());
      })).call(this,Elixir.Enum.member__qmark__(keys(map),key));
      }));
    const get_lazy = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key,func)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([true],function()    {
        return     func(map[key]);
      }),Elixir.Core.Patterns.clause([false],function()    {
        return     func();
      })).call(this,Elixir.Enum.member__qmark__(keys(map),key));
      }));
    const update__emark__ = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key,func)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([true],function()    {
        return     Elixir$ElixirScript$Map.put(map,key,func(map[key]));
      }),Elixir.Core.Patterns.clause([false],function()    {
        throw     {
                [Symbol.for('__struct__')]: Symbol.for('RuntimeError'),         [Symbol.for('__exception__')]: true,         [Symbol.for('message')]: Elixir$ElixirScript$String$Chars.to_string(key) + ' not found in map'
      };
        return     null;
      })).call(this,Elixir.Enum.member__qmark__(keys(map),key));
      }));
    const fetch = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([true],function()    {
        return     new Elixir.Core.Tuple(Symbol.for('ok'),map[key]);
      }),Elixir.Core.Patterns.clause([false],function()    {
        return     Symbol.for('error');
      })).call(this,Elixir.Enum.member__qmark__(keys(map),key));
      }));
    const drop = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,keys)    {
        let [undefined,non_key_map] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.type(Elixir.Core.Tuple,{
        values: [Elixir.Core.Patterns.wildcard(), Elixir.Core.Patterns.variable()]
  }),split(map,keys));
        let _ref = new Elixir.Core.Tuple(undefined,non_key_map);
        return     non_key_map;
      }));
    const pop = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key)    {
        return     pop(map,key,null);
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable(), Elixir.Core.Patterns.variable()],function(map,key,default_value)    {
        return     Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([true],function()    {
        return     new Elixir.Core.Tuple(map[key],Elixir$ElixirScript$Map.__delete__(map,key));
      }),Elixir.Core.Patterns.clause([false],function()    {
        return     new Elixir.Core.Tuple(default_value,map);
      })).call(this,Elixir.Enum.member__qmark__(keys(map),key));
      }));
    export default {
        __new__,     equal__qmark__,     put_new,     has_key__qmark__,     size,     get_and_update,     __delete__,     update,     merge,     take,     to_list,     from_struct,     do_to_list,     put,     get,     split,     keys,     values,     fetch__emark__,     pop_lazy,     put_new_lazy,     get_lazy,     update__emark__,     fetch,     drop,     pop
  };
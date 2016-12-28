    import Elixir from '../elixir/Elixir.Bootstrap';
    import Elixir$ElixirScript$Kernel from '../elixir/Elixir.ElixirScript.Kernel';
    import Elixir$Pair from '../app/Elixir.Pair';
    const main = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([],function()    {
        let [pair] = Elixir.Core.Patterns.match(Elixir.Core.Patterns.variable(),Elixir$Pair.Elixir$Pair.create(Object.freeze({
        [Symbol.for('key')]: 1,     [Symbol.for('value')]: 'A value'
  })));
        return     console.log(pair);
      }));
    export default {
        main
  };